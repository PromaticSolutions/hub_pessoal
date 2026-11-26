import type { Folder } from '@shared/types'
import type { AppContext } from '../context'
import { withTx } from '../db/tx'
import { AppError } from '../lib/errors'
import { camel, insertId, must, requireName } from '../lib/rows'
import { positionForInsert } from '../lib/position'

const SCOPE = 'company_id = ? AND parent_id IS NOT DISTINCT FROM ?'

export async function getFolder(ctx: AppContext, id: number): Promise<Folder> {
  return camel<Folder>(must(await ctx.db.one('SELECT * FROM folders WHERE id = ?', [id]), 'Pasta'))
}

export async function assertFolderInSpace(ctx: AppContext, folderId: number | null, companyId: number): Promise<void> {
  if (folderId == null) return
  const f = await getFolder(ctx, folderId)
  if (f.companyId !== companyId) throw new AppError('VALIDATION', 'A pasta pertence a outro espaço.')
}

export async function createFolder(ctx: AppContext, input: { companyId: number; parentId: number | null; name: string }): Promise<Folder> {
  const name = requireName(input.name)
  await assertFolderInSpace(ctx, input.parentId, input.companyId)
  const pos = await positionForInsert(ctx.db, 'folders', SCOPE, [input.companyId, input.parentId], null, null)
  const id = await insertId(ctx.db, 'INSERT INTO folders(company_id, parent_id, name, position) VALUES (?, ?, ?, ?)', [input.companyId, input.parentId, name, pos])
  return getFolder(ctx, id)
}

export async function updateFolder(ctx: AppContext, id: number, patch: { name?: string; color?: string | null }): Promise<Folder> {
  const cur = await getFolder(ctx, id)
  await ctx.db.run('UPDATE folders SET name = ?, color = ?, updated_at = iso_now() WHERE id = ?', [
    patch.name !== undefined ? requireName(patch.name) : cur.name,
    patch.color !== undefined ? patch.color : cur.color,
    id
  ])
  return getFolder(ctx, id)
}

async function descendantIds(ctx: AppContext, id: number): Promise<number[]> {
  const rows = await ctx.db.many<{ id: number }>(
    `WITH RECURSIVE d(id) AS (SELECT id FROM folders WHERE parent_id = ? UNION ALL SELECT f.id FROM folders f JOIN d ON f.parent_id = d.id)
     SELECT id FROM d`,
    [id]
  )
  return rows.map((r) => r.id)
}

export async function moveFolder(
  ctx: AppContext,
  input: { id: number; companyId: number; parentId: number | null; beforeId: number | null; afterId: number | null }
): Promise<Folder> {
  const f = await getFolder(ctx, input.id)
  const desc = await descendantIds(ctx, f.id)
  if (input.parentId === f.id || (input.parentId != null && desc.includes(input.parentId))) {
    throw new AppError('VALIDATION', 'Não é possível mover uma pasta para dentro dela mesma.')
  }
  await assertFolderInSpace(ctx, input.parentId, input.companyId)
  await withTx(ctx, async (tx) => {
    const pos = await positionForInsert(tx.db, 'folders', SCOPE, [input.companyId, input.parentId], input.beforeId, input.afterId)
    await tx.db.run('UPDATE folders SET company_id = ?, parent_id = ?, position = ?, updated_at = iso_now() WHERE id = ?', [input.companyId, input.parentId, pos, f.id])
    if (input.companyId !== f.companyId) {
      const all = [f.id, ...desc]
      await tx.db.run('UPDATE folders SET company_id = ? WHERE id = ANY(?)', [input.companyId, all])
      await tx.db.run('UPDATE projects SET company_id = ? WHERE folder_id = ANY(?)', [input.companyId, all])
    }
  })
  return getFolder(ctx, f.id)
}

export async function archiveFolder(ctx: AppContext, id: number): Promise<Folder> {
  await getFolder(ctx, id)
  await ctx.db.run('UPDATE folders SET archived_at = iso_now() WHERE id = ?', [id])
  return getFolder(ctx, id)
}

export async function restoreFolder(ctx: AppContext, id: number): Promise<Folder> {
  await getFolder(ctx, id)
  await ctx.db.run('UPDATE folders SET archived_at = NULL WHERE id = ?', [id])
  return getFolder(ctx, id)
}

/** Deletes the folder; its subfolders and projects move up to the folder's parent. */
export async function deleteFolder(ctx: AppContext, id: number): Promise<void> {
  const f = await getFolder(ctx, id)
  await withTx(ctx, async (tx) => {
    await tx.db.run('UPDATE folders SET parent_id = ? WHERE parent_id = ?', [f.parentId, id])
    await tx.db.run('UPDATE projects SET folder_id = ? WHERE folder_id = ?', [f.parentId, id])
    await tx.db.run('DELETE FROM folders WHERE id = ?', [id])
  })
}
