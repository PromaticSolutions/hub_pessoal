import type { Column, ColumnCategory } from '@shared/types'
import type { AppContext } from '../context'
import { withTx } from '../db/tx'
import { AppError } from '../lib/errors'
import { camel, insertId, must, requireName } from '../lib/rows'
import { positionForInsert } from '../lib/position'
import { collectAttachmentPaths, moveToDeleted } from './attachments'

export async function getColumn(ctx: AppContext, id: number): Promise<Column> {
  return camel<Column>(must(await ctx.db.one('SELECT * FROM columns WHERE id = ?', [id]), 'Coluna'))
}

export async function createColumn(
  ctx: AppContext,
  input: { boardId: number; name: string; category: ColumnCategory; afterId?: number | null }
): Promise<Column> {
  const name = requireName(input.name)
  let beforeId: number | null = null
  let afterId: number | null = null
  if (input.afterId != null) {
    beforeId = input.afterId
    const next = await ctx.db.one<{ id: number }>(
      'SELECT id FROM columns WHERE board_id = ? AND position > (SELECT position FROM columns WHERE id = ?) ORDER BY position LIMIT 1',
      [input.boardId, input.afterId]
    )
    afterId = next?.id ?? null
  }
  const pos = await positionForInsert(ctx.db, 'columns', 'board_id = ?', [input.boardId], beforeId, afterId)
  const id = await insertId(ctx.db, 'INSERT INTO columns(board_id, name, category, position) VALUES (?, ?, ?, ?)', [input.boardId, name, input.category, pos])
  return getColumn(ctx, id)
}

export async function updateColumn(
  ctx: AppContext,
  id: number,
  patch: { name?: string; category?: ColumnCategory; color?: string | null }
): Promise<Column> {
  const cur = await getColumn(ctx, id)
  const name = patch.name !== undefined ? requireName(patch.name) : cur.name
  const category = patch.category ?? cur.category
  await withTx(ctx, async (tx) => {
    await tx.db.run('UPDATE columns SET name = ?, category = ?, color = ?, updated_at = iso_now() WHERE id = ?', [
      name,
      category,
      patch.color !== undefined ? patch.color : cur.color,
      id
    ])
    if (category !== cur.category) {
      if (category === 'done') await tx.db.run('UPDATE tasks SET completed_at = coalesce(completed_at, iso_now()) WHERE column_id = ?', [id])
      else await tx.db.run('UPDATE tasks SET completed_at = NULL WHERE column_id = ?', [id])
    }
  })
  return getColumn(ctx, id)
}

export async function moveColumn(ctx: AppContext, input: { id: number; beforeId: number | null; afterId: number | null }): Promise<Column> {
  const c = await getColumn(ctx, input.id)
  const pos = await positionForInsert(ctx.db, 'columns', 'board_id = ? AND id <> ?', [c.boardId, c.id], input.beforeId, input.afterId)
  await ctx.db.run('UPDATE columns SET position = ? WHERE id = ?', [pos, c.id])
  return getColumn(ctx, c.id)
}

export async function deleteColumn(ctx: AppContext, input: { id: number; moveTasksTo: number | null }): Promise<void> {
  const c = await getColumn(ctx, input.id)
  if (input.moveTasksTo != null) {
    const dest = await getColumn(ctx, input.moveTasksTo)
    if (dest.boardId !== c.boardId || dest.id === c.id) throw new AppError('VALIDATION', 'A coluna de destino precisa ser outra coluna do mesmo quadro.')
    await withTx(ctx, async (tx) => {
      const max = (await tx.db.one<{ m: number }>('SELECT coalesce(max(position), 0) m FROM tasks WHERE column_id = ?', [dest.id]))!.m
      const tasks = await tx.db.many<{ id: number }>('SELECT id FROM tasks WHERE column_id = ? ORDER BY position', [c.id])
      for (const [i, t] of tasks.entries()) {
        await tx.db.run(
          `UPDATE tasks SET column_id = ?, position = ?, completed_at = CASE WHEN ?::text = 'done' THEN coalesce(completed_at, iso_now()) ELSE NULL END WHERE id = ?`,
          [dest.id, max + (i + 1) * 1024, dest.category, t.id]
        )
      }
      await tx.db.run('DELETE FROM columns WHERE id = ?', [c.id])
    })
    return
  }
  const files = await collectAttachmentPaths(ctx.db, 't.column_id = ?', [c.id])
  await ctx.db.run('DELETE FROM columns WHERE id = ?', [c.id])
  for (const f of files) await moveToDeleted(ctx.storage, f)
}
