import type { Board, Company, Folder, Project, ProjectStatus } from '@shared/types'
import { toLocalMinute } from '@shared/dates'
import type { AppContext } from '../context'
import { withTx } from '../db/tx'
import { AppError } from '../lib/errors'
import { camel, camelAll, insertId, must, requireName } from '../lib/rows'
import { positionForInsert } from '../lib/position'
import { logActivity } from '../lib/activity'
import { getCompany } from './companies'
import { assertFolderInSpace } from './folders'
import { createBoard, listBoards } from './boards'
import { collectAttachmentPaths, moveToDeleted } from './attachments'

const SCOPE = 'company_id = ? AND folder_id IS NOT DISTINCT FROM ?'

export type ProjectDetail = Project & { company: Company; boards: Board[]; taskCounts: { total: number; done: number; overdue: number } }
export type FolderNode = Folder & { children: FolderNode[]; projects: Project[] }
export type SpaceTree = { company: Company; folders: FolderNode[]; projects: Project[] }[]

export async function getProjectRow(ctx: AppContext, id: number): Promise<Project> {
  return camel<Project>(must(await ctx.db.one('SELECT * FROM projects WHERE id = ?', [id]), 'Projeto'))
}

export async function getProject(ctx: AppContext, id: number): Promise<ProjectDetail> {
  const p = await getProjectRow(ctx, id)
  const counts = (await ctx.db.one<{ total: number; done: number; overdue: number }>(
    `SELECT count(*) total,
       count(*) FILTER (WHERE status = 'done') done,
       count(*) FILTER (WHERE status <> 'done' AND due_end < ?) overdue
     FROM v_tasks WHERE project_id = ? AND archived_at IS NULL`,
    [toLocalMinute(ctx.now()), id]
  ))!
  return { ...p, company: await getCompany(ctx, p.companyId), boards: await listBoards(ctx, { projectId: id }), taskCounts: counts }
}

function checkDates(start: string | null | undefined, due: string | null | undefined) {
  if (start && due && start.slice(0, 10) > due.slice(0, 10)) throw new AppError('VALIDATION', 'A data de início é depois do prazo final.')
}

export async function createProject(
  ctx: AppContext,
  input: {
    companyId: number
    folderId: number | null
    name: string
    description?: string
    color: string
    startDate?: string | null
    dueDate?: string | null
    status?: ProjectStatus
  }
): Promise<Project> {
  const name = requireName(input.name)
  await getCompany(ctx, input.companyId)
  await assertFolderInSpace(ctx, input.folderId, input.companyId)
  checkDates(input.startDate, input.dueDate)
  return withTx(ctx, async (tx) => {
    const pos = await positionForInsert(tx.db, 'projects', SCOPE, [input.companyId, input.folderId], null, null)
    const id = await insertId(
      tx.db,
      'INSERT INTO projects(company_id, folder_id, name, description, color, start_date, due_date, status, position) VALUES (?,?,?,?,?,?,?,?,?)',
      [input.companyId, input.folderId, name, input.description ?? '', input.color, input.startDate ?? null, input.dueDate ?? null, input.status ?? 'active', pos]
    )
    await createBoard(tx, { projectId: id, name: 'Quadro principal' })
    await logActivity(tx.db, { entityType: 'project', entityId: id, action: 'created' })
    return getProjectRow(tx, id)
  })
}

export async function updateProject(
  ctx: AppContext,
  id: number,
  patch: Partial<{ name: string; description: string; color: string; startDate: string | null; dueDate: string | null; status: ProjectStatus }>
): Promise<Project> {
  const cur = await getProjectRow(ctx, id)
  const next = {
    name: patch.name !== undefined ? requireName(patch.name) : cur.name,
    description: patch.description ?? cur.description,
    color: patch.color ?? cur.color,
    startDate: patch.startDate !== undefined ? patch.startDate : cur.startDate,
    dueDate: patch.dueDate !== undefined ? patch.dueDate : cur.dueDate,
    status: patch.status ?? cur.status
  }
  checkDates(next.startDate, next.dueDate)
  await ctx.db.run('UPDATE projects SET name=?, description=?, color=?, start_date=?, due_date=?, status=?, updated_at=iso_now() WHERE id=?', [
    next.name,
    next.description,
    next.color,
    next.startDate,
    next.dueDate,
    next.status,
    id
  ])
  for (const k of Object.keys(next) as (keyof typeof next)[]) {
    if (next[k] !== cur[k]) await logActivity(ctx.db, { entityType: 'project', entityId: id, action: 'updated', field: k, oldValue: cur[k], newValue: next[k] })
  }
  return getProjectRow(ctx, id)
}

export async function moveProject(
  ctx: AppContext,
  input: { id: number; companyId: number; folderId: number | null; beforeId: number | null; afterId: number | null }
): Promise<Project> {
  const cur = await getProjectRow(ctx, input.id)
  await getCompany(ctx, input.companyId)
  await assertFolderInSpace(ctx, input.folderId, input.companyId)
  const pos = await positionForInsert(ctx.db, 'projects', SCOPE, [input.companyId, input.folderId], input.beforeId, input.afterId)
  await ctx.db.run('UPDATE projects SET company_id=?, folder_id=?, position=?, updated_at=iso_now() WHERE id=?', [input.companyId, input.folderId, pos, input.id])
  if (cur.companyId !== input.companyId) {
    await logActivity(ctx.db, { entityType: 'project', entityId: input.id, action: 'moved', field: 'company', oldValue: cur.companyId, newValue: input.companyId })
  }
  return getProjectRow(ctx, input.id)
}

export async function archiveProject(ctx: AppContext, id: number): Promise<Project> {
  await getProjectRow(ctx, id)
  await ctx.db.run('UPDATE projects SET archived_at = iso_now() WHERE id = ?', [id])
  await logActivity(ctx.db, { entityType: 'project', entityId: id, action: 'archived' })
  return getProjectRow(ctx, id)
}

export async function restoreProject(ctx: AppContext, id: number): Promise<Project> {
  await getProjectRow(ctx, id)
  await ctx.db.run('UPDATE projects SET archived_at = NULL WHERE id = ?', [id])
  await logActivity(ctx.db, { entityType: 'project', entityId: id, action: 'restored' })
  return getProjectRow(ctx, id)
}

export async function getProjectDeletionImpact(ctx: AppContext, id: number): Promise<{ boards: number; tasks: number; attachments: number }> {
  await getProjectRow(ctx, id)
  const one = async (sql: string) => (await ctx.db.one<{ n: number }>(sql, [id]))!.n
  return {
    boards: await one('SELECT count(*) n FROM boards WHERE project_id = ?'),
    tasks: await one('SELECT count(*) n FROM v_tasks WHERE project_id = ?'),
    attachments: (await collectAttachmentPaths(ctx.db, 'p.id = ?', [id])).length
  }
}

export async function deleteProject(ctx: AppContext, id: number): Promise<void> {
  const p = await getProjectRow(ctx, id)
  const files = await collectAttachmentPaths(ctx.db, 'p.id = ?', [id])
  await withTx(ctx, async (tx) => {
    await tx.db.run('DELETE FROM projects WHERE id = ?', [id])
    await logActivity(tx.db, { entityType: 'project', entityId: id, action: 'deleted', oldValue: p.name })
  })
  for (const f of files) await moveToDeleted(ctx.storage, f)
}

export async function getSpaceTree(ctx: AppContext, opts: { includeArchived?: boolean }): Promise<SpaceTree> {
  const arch = !!opts.includeArchived
  const companies = camelAll<Company>(
    await ctx.db.many("SELECT * FROM companies WHERE (?::boolean OR status = 'active') ORDER BY is_personal DESC, position, id", [arch])
  )
  const folders = camelAll<Folder>(await ctx.db.many('SELECT * FROM folders WHERE (?::boolean OR archived_at IS NULL) ORDER BY position, id', [arch]))
  const projects = camelAll<Project>(await ctx.db.many('SELECT * FROM projects WHERE (?::boolean OR archived_at IS NULL) ORDER BY position, id', [arch]))
  const build = (companyId: number, parentId: number | null): FolderNode[] =>
    folders
      .filter((f) => f.companyId === companyId && f.parentId === parentId)
      .map((f) => ({ ...f, children: build(companyId, f.id), projects: projects.filter((p) => p.folderId === f.id) }))
  return companies.map((c) => ({
    company: c,
    folders: build(c.id, null),
    projects: projects.filter((p) => p.companyId === c.id && p.folderId == null)
  }))
}
