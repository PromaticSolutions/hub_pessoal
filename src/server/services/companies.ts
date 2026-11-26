import type { Company } from '@shared/types'
import { toLocalMinute } from '@shared/dates'
import type { AppContext } from '../context'
import { withTx } from '../db/tx'
import { AppError } from '../lib/errors'
import { camel, insertId, must, requireName } from '../lib/rows'
import { logActivity } from '../lib/activity'
import { positionForInsert } from '../lib/position'
import { collectAttachmentPaths, moveToDeleted } from './attachments'

export type CompanySummary = Company & { activeProjects: number; openTasks: number; overdueTasks: number }

export async function getCompany(ctx: AppContext, id: number): Promise<Company> {
  return camel<Company>(must(await ctx.db.one('SELECT * FROM companies WHERE id = ?', [id]), 'Empresa'))
}

export async function listCompanies(ctx: AppContext, opts: { includeArchived?: boolean }): Promise<CompanySummary[]> {
  const now = toLocalMinute(ctx.now())
  const rows = await ctx.db.many(
    `SELECT c.*,
      (SELECT count(*) FROM projects p WHERE p.company_id = c.id AND p.archived_at IS NULL AND p.status = 'active') AS active_projects,
      (SELECT count(*) FROM v_tasks t WHERE t.company_id = c.id AND t.status <> 'done' AND t.effective_archived = 0) AS open_tasks,
      (SELECT count(*) FROM v_tasks t WHERE t.company_id = c.id AND t.status <> 'done' AND t.effective_archived = 0 AND t.due_end < ?) AS overdue_tasks
     FROM companies c
     WHERE (?::boolean OR c.status = 'active')
     ORDER BY c.is_personal DESC, c.position, c.id`,
    [now, !!opts.includeArchived]
  )
  return rows.map((r) => camel<CompanySummary>(r))
}

export async function createCompany(ctx: AppContext, input: { name: string; description?: string; color: string }): Promise<Company> {
  const name = requireName(input.name)
  const pos = await positionForInsert(ctx.db, 'companies', '1 = 1', [], null, null)
  const id = await insertId(ctx.db, 'INSERT INTO companies(name, description, color, position) VALUES (?, ?, ?, ?)', [
    name,
    input.description ?? '',
    input.color,
    pos
  ])
  await logActivity(ctx.db, { entityType: 'company', entityId: id, action: 'created' })
  return getCompany(ctx, id)
}

export async function updateCompany(ctx: AppContext, id: number, patch: { name?: string; description?: string; color?: string }): Promise<Company> {
  const cur = await getCompany(ctx, id)
  const next = {
    name: patch.name !== undefined ? requireName(patch.name) : cur.name,
    description: patch.description ?? cur.description,
    color: patch.color ?? cur.color
  }
  await ctx.db.run('UPDATE companies SET name = ?, description = ?, color = ?, updated_at = iso_now() WHERE id = ?', [
    next.name,
    next.description,
    next.color,
    id
  ])
  for (const k of ['name', 'description', 'color'] as const) {
    if (next[k] !== cur[k]) await logActivity(ctx.db, { entityType: 'company', entityId: id, action: 'updated', field: k, oldValue: cur[k], newValue: next[k] })
  }
  return getCompany(ctx, id)
}

// Task 5: logos move to Storage.
export async function setCompanyLogo(_ctx: AppContext, _id: number, _sourcePath: string | null): Promise<Company> {
  throw new AppError('INTERNAL', 'pendente')
}

function assertNotPersonal(c: Company, what: string) {
  if (c.isPersonal) throw new AppError('FORBIDDEN', `O espaço Pessoal não pode ser ${what}.`)
}

export async function archiveCompany(ctx: AppContext, id: number): Promise<Company> {
  assertNotPersonal(await getCompany(ctx, id), 'arquivado')
  await ctx.db.run("UPDATE companies SET status = 'archived', archived_at = iso_now() WHERE id = ?", [id])
  await logActivity(ctx.db, { entityType: 'company', entityId: id, action: 'archived' })
  return getCompany(ctx, id)
}

export async function restoreCompany(ctx: AppContext, id: number): Promise<Company> {
  await getCompany(ctx, id)
  await ctx.db.run("UPDATE companies SET status = 'active', archived_at = NULL WHERE id = ?", [id])
  await logActivity(ctx.db, { entityType: 'company', entityId: id, action: 'restored' })
  return getCompany(ctx, id)
}

export async function getCompanyDeletionImpact(ctx: AppContext, id: number): Promise<{ projects: number; tasks: number; attachments: number }> {
  await getCompany(ctx, id)
  const one = async (sql: string) => (await ctx.db.one<{ n: number }>(sql, [id]))!.n
  return {
    projects: await one('SELECT count(*) n FROM projects WHERE company_id = ?'),
    tasks: await one('SELECT count(*) n FROM v_tasks WHERE company_id = ?'),
    attachments: (await collectAttachmentPaths(ctx.db, 'p.company_id = ?', [id])).length
  }
}

export async function deleteCompany(ctx: AppContext, id: number): Promise<void> {
  const c = await getCompany(ctx, id)
  assertNotPersonal(c, 'excluído')
  const files = await collectAttachmentPaths(ctx.db, 'p.company_id = ?', [id])
  await withTx(ctx, async (tx) => {
    await tx.db.run('DELETE FROM companies WHERE id = ?', [id])
    await logActivity(tx.db, { entityType: 'company', entityId: id, action: 'deleted', oldValue: c.name })
  })
  for (const f of files) await moveToDeleted(ctx.storage, f)
  if (c.logoPath) await ctx.storage.remove([c.logoPath])
}

export async function reorderCompany(ctx: AppContext, id: number, where: { beforeId: number | null; afterId: number | null }): Promise<void> {
  await getCompany(ctx, id)
  const pos = await positionForInsert(ctx.db, 'companies', 'is_personal = 0', [], where.beforeId, where.afterId)
  await ctx.db.run('UPDATE companies SET position = ? WHERE id = ?', [pos, id])
}

/** Logo as data URL. Task 5: read from Storage. */
export async function getCompanyLogoDataUrl(_ctx: AppContext, _id: number): Promise<string | null> {
  throw new AppError('INTERNAL', 'pendente')
}
