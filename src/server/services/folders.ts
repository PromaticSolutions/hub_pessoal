import type { Folder } from '@shared/types'
import type { AppContext } from '../context'
import { AppError } from '../lib/errors'
import { camel, must, requireName } from '../lib/rows'
import { positionForInsert } from '../lib/position'

const TS = "strftime('%Y-%m-%dT%H:%M:%fZ','now')"

export function getFolder(ctx: AppContext, id: number): Folder {
  return camel<Folder>(must(ctx.db.prepare('SELECT * FROM folders WHERE id = ?').get(id) as Record<string, unknown>, 'Pasta'))
}

export function assertFolderInSpace(ctx: AppContext, folderId: number | null, companyId: number): void {
  if (folderId == null) return
  const f = getFolder(ctx, folderId)
  if (f.companyId !== companyId) throw new AppError('VALIDATION', 'A pasta pertence a outro espaço.')
}

export function createFolder(ctx: AppContext, input: { companyId: number; parentId: number | null; name: string }): Folder {
  const name = requireName(input.name)
  assertFolderInSpace(ctx, input.parentId, input.companyId)
  const pos = positionForInsert(ctx.db, 'folders', 'company_id = ? AND parent_id IS ?', [input.companyId, input.parentId], null, null)
  const id = ctx.db
    .prepare('INSERT INTO folders(company_id, parent_id, name, position) VALUES (?, ?, ?, ?)')
    .run(input.companyId, input.parentId, name, pos).lastInsertRowid as number
  return getFolder(ctx, id)
}

export function updateFolder(ctx: AppContext, id: number, patch: { name?: string; color?: string | null }): Folder {
  const cur = getFolder(ctx, id)
  ctx.db
    .prepare(`UPDATE folders SET name = ?, color = ?, updated_at = ${TS} WHERE id = ?`)
    .run(patch.name !== undefined ? requireName(patch.name) : cur.name, patch.color !== undefined ? patch.color : cur.color, id)
  return getFolder(ctx, id)
}

function descendantIds(ctx: AppContext, id: number): number[] {
  const rows = ctx.db
    .prepare(
      `WITH RECURSIVE d(id) AS (SELECT id FROM folders WHERE parent_id = ? UNION ALL SELECT f.id FROM folders f JOIN d ON f.parent_id = d.id)
       SELECT id FROM d`
    )
    .all(id) as { id: number }[]
  return rows.map((r) => r.id)
}

export function moveFolder(
  ctx: AppContext,
  input: { id: number; companyId: number; parentId: number | null; beforeId: number | null; afterId: number | null }
): Folder {
  const f = getFolder(ctx, input.id)
  const desc = descendantIds(ctx, f.id)
  if (input.parentId === f.id || (input.parentId != null && desc.includes(input.parentId))) {
    throw new AppError('VALIDATION', 'Não é possível mover uma pasta para dentro dela mesma.')
  }
  assertFolderInSpace(ctx, input.parentId, input.companyId)
  ctx.db.transaction(() => {
    const pos = positionForInsert(ctx.db, 'folders', 'company_id = ? AND parent_id IS ?', [input.companyId, input.parentId], input.beforeId, input.afterId)
    ctx.db.prepare(`UPDATE folders SET company_id = ?, parent_id = ?, position = ?, updated_at = ${TS} WHERE id = ?`).run(input.companyId, input.parentId, pos, f.id)
    if (input.companyId !== f.companyId) {
      const all = [f.id, ...desc]
      const ph = all.map(() => '?').join(',')
      ctx.db.prepare(`UPDATE folders SET company_id = ? WHERE id IN (${ph})`).run(input.companyId, ...all)
      ctx.db.prepare(`UPDATE projects SET company_id = ? WHERE folder_id IN (${ph})`).run(input.companyId, ...all)
    }
  })()
  return getFolder(ctx, f.id)
}

export function archiveFolder(ctx: AppContext, id: number): Folder {
  getFolder(ctx, id)
  ctx.db.prepare(`UPDATE folders SET archived_at = ${TS} WHERE id = ?`).run(id)
  return getFolder(ctx, id)
}

export function restoreFolder(ctx: AppContext, id: number): Folder {
  getFolder(ctx, id)
  ctx.db.prepare('UPDATE folders SET archived_at = NULL WHERE id = ?').run(id)
  return getFolder(ctx, id)
}

/** Deletes the folder; its subfolders and projects move up to the folder's parent. */
export function deleteFolder(ctx: AppContext, id: number): void {
  const f = getFolder(ctx, id)
  ctx.db.transaction(() => {
    ctx.db.prepare('UPDATE folders SET parent_id = ? WHERE parent_id = ?').run(f.parentId, id)
    ctx.db.prepare('UPDATE projects SET folder_id = ? WHERE folder_id = ?').run(f.parentId, id)
    ctx.db.prepare('DELETE FROM folders WHERE id = ?').run(id)
  })()
}
