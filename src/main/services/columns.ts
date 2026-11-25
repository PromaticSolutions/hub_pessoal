import type { Column, ColumnCategory } from '@shared/types'
import type { AppContext } from '../context'
import { AppError } from '../lib/errors'
import { camel, must, requireName } from '../lib/rows'
import { positionForInsert } from '../lib/position'
import { collectAttachmentPaths, moveToDeleted } from './attachments'

const TS = "strftime('%Y-%m-%dT%H:%M:%fZ','now')"

export function getColumn(ctx: AppContext, id: number): Column {
  return camel<Column>(must(ctx.db.prepare('SELECT * FROM columns WHERE id = ?').get(id) as Record<string, unknown>, 'Coluna'))
}

export function createColumn(ctx: AppContext, input: { boardId: number; name: string; category: ColumnCategory; afterId?: number | null }): Column {
  const name = requireName(input.name)
  let beforeId: number | null = null
  let afterId: number | null = null
  if (input.afterId != null) {
    beforeId = input.afterId
    const next = ctx.db
      .prepare('SELECT id FROM columns WHERE board_id = ? AND position > (SELECT position FROM columns WHERE id = ?) ORDER BY position LIMIT 1')
      .get(input.boardId, input.afterId) as { id: number } | undefined
    afterId = next?.id ?? null
  }
  const pos = positionForInsert(ctx.db, 'columns', 'board_id = ?', [input.boardId], beforeId, afterId)
  const id = ctx.db.prepare('INSERT INTO columns(board_id, name, category, position) VALUES (?, ?, ?, ?)').run(input.boardId, name, input.category, pos)
    .lastInsertRowid as number
  return getColumn(ctx, id)
}

export function updateColumn(ctx: AppContext, id: number, patch: { name?: string; category?: ColumnCategory }): Column {
  const cur = getColumn(ctx, id)
  const name = patch.name !== undefined ? requireName(patch.name) : cur.name
  const category = patch.category ?? cur.category
  ctx.db.transaction(() => {
    ctx.db.prepare(`UPDATE columns SET name = ?, category = ?, updated_at = ${TS} WHERE id = ?`).run(name, category, id)
    if (category !== cur.category) {
      if (category === 'done') ctx.db.prepare(`UPDATE tasks SET completed_at = coalesce(completed_at, ${TS}) WHERE column_id = ?`).run(id)
      else ctx.db.prepare('UPDATE tasks SET completed_at = NULL WHERE column_id = ?').run(id)
    }
  })()
  return getColumn(ctx, id)
}

export function moveColumn(ctx: AppContext, input: { id: number; beforeId: number | null; afterId: number | null }): Column {
  const c = getColumn(ctx, input.id)
  const pos = positionForInsert(ctx.db, 'columns', 'board_id = ? AND id <> ?', [c.boardId, c.id], input.beforeId, input.afterId)
  ctx.db.prepare('UPDATE columns SET position = ? WHERE id = ?').run(pos, c.id)
  return getColumn(ctx, c.id)
}

export function deleteColumn(ctx: AppContext, input: { id: number; moveTasksTo: number | null }): void {
  const c = getColumn(ctx, input.id)
  if (input.moveTasksTo != null) {
    const dest = getColumn(ctx, input.moveTasksTo)
    if (dest.boardId !== c.boardId || dest.id === c.id) throw new AppError('VALIDATION', 'A coluna de destino precisa ser outra coluna do mesmo quadro.')
    ctx.db.transaction(() => {
      const max = (ctx.db.prepare('SELECT coalesce(max(position), 0) m FROM tasks WHERE column_id = ?').get(dest.id) as { m: number }).m
      const tasks = ctx.db.prepare('SELECT id FROM tasks WHERE column_id = ? ORDER BY position').all(c.id) as { id: number }[]
      const upd = ctx.db.prepare(
        `UPDATE tasks SET column_id = ?, position = ?, completed_at = CASE WHEN ? = 'done' THEN coalesce(completed_at, ${TS}) ELSE NULL END WHERE id = ?`
      )
      tasks.forEach((t, i) => upd.run(dest.id, max + (i + 1) * 1024, dest.category, t.id))
      ctx.db.prepare('DELETE FROM columns WHERE id = ?').run(c.id)
    })()
    return
  }
  const files = collectAttachmentPaths(ctx.db, 't.column_id = ?', [c.id])
  ctx.db.prepare('DELETE FROM columns WHERE id = ?').run(c.id)
  for (const f of files) moveToDeleted(ctx.paths, f)
}
