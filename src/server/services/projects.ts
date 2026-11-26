import type { Board, Company, Folder, Project, ProjectStatus } from '@shared/types'
import { toLocalMinute } from '@shared/dates'
import type { AppContext } from '../context'
import { AppError } from '../lib/errors'
import { camel, camelAll, must, requireName } from '../lib/rows'
import { positionForInsert } from '../lib/position'
import { logActivity } from '../lib/activity'
import { getCompany } from './companies'
import { assertFolderInSpace } from './folders'
import { createBoard, listBoards } from './boards'
import { collectAttachmentPaths, moveToDeleted } from './attachments'

const TS = "strftime('%Y-%m-%dT%H:%M:%fZ','now')"

export type ProjectDetail = Project & { company: Company; boards: Board[]; taskCounts: { total: number; done: number; overdue: number } }
export type FolderNode = Folder & { children: FolderNode[]; projects: Project[] }
export type SpaceTree = { company: Company; folders: FolderNode[]; projects: Project[] }[]

export function getProjectRow(ctx: AppContext, id: number): Project {
  return camel<Project>(must(ctx.db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as Record<string, unknown>, 'Projeto'))
}

export function getProject(ctx: AppContext, id: number): ProjectDetail {
  const p = getProjectRow(ctx, id)
  const counts = ctx.db
    .prepare(
      `SELECT count(*) total,
         coalesce(sum(status = 'done'), 0) done,
         coalesce(sum(status <> 'done' AND due_end < ?), 0) overdue
       FROM v_tasks WHERE project_id = ? AND archived_at IS NULL`
    )
    .get(toLocalMinute(ctx.now()), id) as { total: number; done: number; overdue: number }
  return { ...p, company: getCompany(ctx, p.companyId), boards: listBoards(ctx, { projectId: id }), taskCounts: counts }
}

function checkDates(start: string | null | undefined, due: string | null | undefined) {
  if (start && due && start.slice(0, 10) > due.slice(0, 10)) throw new AppError('VALIDATION', 'A data de início é depois do prazo final.')
}

export function createProject(
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
): Project {
  const name = requireName(input.name)
  getCompany(ctx, input.companyId)
  assertFolderInSpace(ctx, input.folderId, input.companyId)
  checkDates(input.startDate, input.dueDate)
  return ctx.db.transaction(() => {
    const pos = positionForInsert(ctx.db, 'projects', 'company_id = ? AND folder_id IS ?', [input.companyId, input.folderId], null, null)
    const id = ctx.db
      .prepare('INSERT INTO projects(company_id, folder_id, name, description, color, start_date, due_date, status, position) VALUES (?,?,?,?,?,?,?,?,?)')
      .run(input.companyId, input.folderId, name, input.description ?? '', input.color, input.startDate ?? null, input.dueDate ?? null, input.status ?? 'active', pos)
      .lastInsertRowid as number
    createBoard(ctx, { projectId: id, name: 'Quadro principal' })
    logActivity(ctx.db, { entityType: 'project', entityId: id, action: 'created' })
    return getProjectRow(ctx, id)
  })()
}

export function updateProject(
  ctx: AppContext,
  id: number,
  patch: Partial<{ name: string; description: string; color: string; startDate: string | null; dueDate: string | null; status: ProjectStatus }>
): Project {
  const cur = getProjectRow(ctx, id)
  const next = {
    name: patch.name !== undefined ? requireName(patch.name) : cur.name,
    description: patch.description ?? cur.description,
    color: patch.color ?? cur.color,
    startDate: patch.startDate !== undefined ? patch.startDate : cur.startDate,
    dueDate: patch.dueDate !== undefined ? patch.dueDate : cur.dueDate,
    status: patch.status ?? cur.status
  }
  checkDates(next.startDate, next.dueDate)
  ctx.db
    .prepare(`UPDATE projects SET name=?, description=?, color=?, start_date=?, due_date=?, status=?, updated_at=${TS} WHERE id=?`)
    .run(next.name, next.description, next.color, next.startDate, next.dueDate, next.status, id)
  for (const k of Object.keys(next) as (keyof typeof next)[]) {
    if (next[k] !== cur[k]) logActivity(ctx.db, { entityType: 'project', entityId: id, action: 'updated', field: k, oldValue: cur[k], newValue: next[k] })
  }
  return getProjectRow(ctx, id)
}

export function moveProject(
  ctx: AppContext,
  input: { id: number; companyId: number; folderId: number | null; beforeId: number | null; afterId: number | null }
): Project {
  const cur = getProjectRow(ctx, input.id)
  getCompany(ctx, input.companyId)
  assertFolderInSpace(ctx, input.folderId, input.companyId)
  const pos = positionForInsert(ctx.db, 'projects', 'company_id = ? AND folder_id IS ?', [input.companyId, input.folderId], input.beforeId, input.afterId)
  ctx.db.prepare(`UPDATE projects SET company_id=?, folder_id=?, position=?, updated_at=${TS} WHERE id=?`).run(input.companyId, input.folderId, pos, input.id)
  if (cur.companyId !== input.companyId) {
    logActivity(ctx.db, { entityType: 'project', entityId: input.id, action: 'moved', field: 'company', oldValue: cur.companyId, newValue: input.companyId })
  }
  return getProjectRow(ctx, input.id)
}

export function archiveProject(ctx: AppContext, id: number): Project {
  getProjectRow(ctx, id)
  ctx.db.prepare(`UPDATE projects SET archived_at = ${TS} WHERE id = ?`).run(id)
  logActivity(ctx.db, { entityType: 'project', entityId: id, action: 'archived' })
  return getProjectRow(ctx, id)
}

export function restoreProject(ctx: AppContext, id: number): Project {
  getProjectRow(ctx, id)
  ctx.db.prepare('UPDATE projects SET archived_at = NULL WHERE id = ?').run(id)
  logActivity(ctx.db, { entityType: 'project', entityId: id, action: 'restored' })
  return getProjectRow(ctx, id)
}

export function getProjectDeletionImpact(ctx: AppContext, id: number): { boards: number; tasks: number; attachments: number } {
  getProjectRow(ctx, id)
  const one = (sql: string) => (ctx.db.prepare(sql).get(id) as { n: number }).n
  return {
    boards: one('SELECT count(*) n FROM boards WHERE project_id = ?'),
    tasks: one('SELECT count(*) n FROM v_tasks WHERE project_id = ?'),
    attachments: collectAttachmentPaths(ctx.db, 'p.id = ?', [id]).length
  }
}

export function deleteProject(ctx: AppContext, id: number): void {
  const p = getProjectRow(ctx, id)
  const files = collectAttachmentPaths(ctx.db, 'p.id = ?', [id])
  ctx.db.transaction(() => {
    ctx.db.prepare('DELETE FROM projects WHERE id = ?').run(id)
    logActivity(ctx.db, { entityType: 'project', entityId: id, action: 'deleted', oldValue: p.name })
  })()
  for (const f of files) moveToDeleted(ctx.paths, f)
}

export function getSpaceTree(ctx: AppContext, opts: { includeArchived?: boolean }): SpaceTree {
  const arch = opts.includeArchived ? 1 : 0
  const companies = camelAll<Company>(
    ctx.db.prepare("SELECT * FROM companies WHERE (? OR status = 'active') ORDER BY is_personal DESC, position, id").all(arch)
  )
  const folders = camelAll<Folder>(ctx.db.prepare('SELECT * FROM folders WHERE (? OR archived_at IS NULL) ORDER BY position, id').all(arch))
  const projects = camelAll<Project>(ctx.db.prepare('SELECT * FROM projects WHERE (? OR archived_at IS NULL) ORDER BY position, id').all(arch))
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
