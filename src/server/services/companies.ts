import { copyFileSync, readFileSync, rmSync } from 'node:fs'
import { extname, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { Company } from '@shared/types'
import { toLocalMinute } from '@shared/dates'
import type { AppContext } from '../context'
import { AppError } from '../lib/errors'
import { camel, must, requireName } from '../lib/rows'
import { logActivity } from '../lib/activity'
import { positionForInsert } from '../lib/position'
import { collectAttachmentPaths, moveToDeleted } from './attachments'

export type CompanySummary = Company & { activeProjects: number; openTasks: number; overdueTasks: number }

export function getCompany(ctx: AppContext, id: number): Company {
  return camel<Company>(must(ctx.db.prepare('SELECT * FROM companies WHERE id = ?').get(id) as Record<string, unknown>, 'Empresa'))
}

export function listCompanies(ctx: AppContext, opts: { includeArchived?: boolean }): CompanySummary[] {
  const now = toLocalMinute(ctx.now())
  const rows = ctx.db
    .prepare(
      `SELECT c.*,
        (SELECT count(*) FROM projects p WHERE p.company_id = c.id AND p.archived_at IS NULL AND p.status = 'active') AS active_projects,
        (SELECT count(*) FROM v_tasks t WHERE t.company_id = c.id AND t.status <> 'done' AND NOT t.effective_archived) AS open_tasks,
        (SELECT count(*) FROM v_tasks t WHERE t.company_id = c.id AND t.status <> 'done' AND NOT t.effective_archived AND t.due_end < ?) AS overdue_tasks
       FROM companies c
       WHERE (? OR c.status = 'active')
       ORDER BY c.is_personal DESC, c.position, c.id`
    )
    .all(now, opts.includeArchived ? 1 : 0) as Record<string, unknown>[]
  return rows.map((r) => camel<CompanySummary>(r))
}

export function createCompany(ctx: AppContext, input: { name: string; description?: string; color: string }): Company {
  const name = requireName(input.name)
  const pos = positionForInsert(ctx.db, 'companies', '1', [], null, null)
  const id = ctx.db
    .prepare('INSERT INTO companies(name, description, color, position) VALUES (?, ?, ?, ?)')
    .run(name, input.description ?? '', input.color, pos).lastInsertRowid as number
  logActivity(ctx.db, { entityType: 'company', entityId: id, action: 'created' })
  return getCompany(ctx, id)
}

export function updateCompany(ctx: AppContext, id: number, patch: { name?: string; description?: string; color?: string }): Company {
  const cur = getCompany(ctx, id)
  const next = {
    name: patch.name !== undefined ? requireName(patch.name) : cur.name,
    description: patch.description ?? cur.description,
    color: patch.color ?? cur.color
  }
  ctx.db
    .prepare("UPDATE companies SET name = ?, description = ?, color = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?")
    .run(next.name, next.description, next.color, id)
  for (const k of ['name', 'description', 'color'] as const) {
    if (next[k] !== cur[k]) logActivity(ctx.db, { entityType: 'company', entityId: id, action: 'updated', field: k, oldValue: cur[k], newValue: next[k] })
  }
  return getCompany(ctx, id)
}

export function setCompanyLogo(ctx: AppContext, id: number, sourcePath: string | null): Company {
  const cur = getCompany(ctx, id)
  let rel: string | null = null
  if (sourcePath) {
    rel = `logos/${id}-${randomUUID()}${extname(sourcePath).toLowerCase()}`
    copyFileSync(sourcePath, join(ctx.paths.root, rel))
  }
  ctx.db.prepare("UPDATE companies SET logo_path = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?").run(rel, id)
  if (cur.logoPath) rmSync(join(ctx.paths.root, cur.logoPath), { force: true })
  return getCompany(ctx, id)
}

function assertNotPersonal(c: Company, what: string) {
  if (c.isPersonal) throw new AppError('FORBIDDEN', `O espaço Pessoal não pode ser ${what}.`)
}

export function archiveCompany(ctx: AppContext, id: number): Company {
  assertNotPersonal(getCompany(ctx, id), 'arquivado')
  ctx.db.prepare("UPDATE companies SET status = 'archived', archived_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?").run(id)
  logActivity(ctx.db, { entityType: 'company', entityId: id, action: 'archived' })
  return getCompany(ctx, id)
}

export function restoreCompany(ctx: AppContext, id: number): Company {
  getCompany(ctx, id)
  ctx.db.prepare("UPDATE companies SET status = 'active', archived_at = NULL WHERE id = ?").run(id)
  logActivity(ctx.db, { entityType: 'company', entityId: id, action: 'restored' })
  return getCompany(ctx, id)
}

export function getCompanyDeletionImpact(ctx: AppContext, id: number): { projects: number; tasks: number; attachments: number } {
  getCompany(ctx, id)
  const one = (sql: string) => (ctx.db.prepare(sql).get(id) as { n: number }).n
  return {
    projects: one('SELECT count(*) n FROM projects WHERE company_id = ?'),
    tasks: one('SELECT count(*) n FROM v_tasks WHERE company_id = ?'),
    attachments: collectAttachmentPaths(ctx.db, 'p.company_id = ?', [id]).length
  }
}

export function deleteCompany(ctx: AppContext, id: number): void {
  const c = getCompany(ctx, id)
  assertNotPersonal(c, 'excluído')
  const files = collectAttachmentPaths(ctx.db, 'p.company_id = ?', [id])
  ctx.db.transaction(() => {
    ctx.db.prepare('DELETE FROM companies WHERE id = ?').run(id)
    logActivity(ctx.db, { entityType: 'company', entityId: id, action: 'deleted', oldValue: c.name })
  })()
  for (const f of files) moveToDeleted(ctx.paths, f)
  if (c.logoPath) rmSync(join(ctx.paths.root, c.logoPath), { force: true })
}

export function reorderCompany(ctx: AppContext, id: number, where: { beforeId: number | null; afterId: number | null }): void {
  getCompany(ctx, id)
  const pos = positionForInsert(ctx.db, 'companies', 'is_personal = 0', [], where.beforeId, where.afterId)
  ctx.db.prepare('UPDATE companies SET position = ? WHERE id = ?').run(pos, id)
}

const IMAGE_MIME: Record<string, string> = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml' }

/** Logo as data URL (renderer is sandboxed and cannot read files). */
export function getCompanyLogoDataUrl(ctx: AppContext, id: number): string | null {
  const c = getCompany(ctx, id)
  if (!c.logoPath) return null
  try {
    const buf = readFileSync(join(ctx.paths.root, c.logoPath))
    return `data:${IMAGE_MIME[extname(c.logoPath)] ?? 'application/octet-stream'};base64,${buf.toString('base64')}`
  } catch {
    return null
  }
}
