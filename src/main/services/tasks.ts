import type { ColumnCategory, Priority, Task } from '@shared/types'
import { CATEGORY_LABELS } from '@shared/constants'
import type { AppContext } from '../context'
import { AppError } from '../lib/errors'
import { camel, must, requireName } from '../lib/rows'
import { positionForInsert } from '../lib/position'
import { logActivity } from '../lib/activity'
import { getColumn } from './columns'

const TS = "strftime('%Y-%m-%dT%H:%M:%fZ','now')"

export function getTaskRow(ctx: AppContext, id: number): Task {
  return camel<Task>(must(ctx.db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as Record<string, unknown>, 'Tarefa'))
}

export function createTask(
  ctx: AppContext,
  input: { columnId: number; title: string; afterId?: number | null; description?: string; priority?: Priority; startAt?: string | null; dueAt?: string | null }
): Task {
  const title = requireName(input.title, 'Título')
  const col = getColumn(ctx, input.columnId)
  return ctx.db.transaction(() => {
    let beforeId: number | null = null
    let afterId: number | null = null
    if (input.afterId != null) {
      beforeId = input.afterId
      const next = ctx.db
        .prepare('SELECT id FROM tasks WHERE column_id = ? AND position > (SELECT position FROM tasks WHERE id = ?) ORDER BY position LIMIT 1')
        .get(col.id, input.afterId) as { id: number } | undefined
      afterId = next?.id ?? null
    }
    const pos = positionForInsert(ctx.db, 'tasks', 'column_id = ?', [col.id], beforeId, afterId)
    const id = ctx.db
      .prepare(
        `INSERT INTO tasks(board_id, column_id, title, description, priority, start_at, due_at, completed_at, position)
         VALUES (?, ?, ?, ?, ?, ?, ?, CASE WHEN ? = 'done' THEN ${TS} END, ?)`
      )
      .run(col.boardId, col.id, title, input.description ?? '', input.priority ?? 'medium', input.startAt ?? null, input.dueAt ?? null, col.category, pos)
      .lastInsertRowid as number
    logActivity(ctx.db, { entityType: 'task', entityId: id, taskId: id, action: 'created' })
    return getTaskRow(ctx, id)
  })()
}

export function moveTask(ctx: AppContext, input: { id: number; columnId: number; beforeId: number | null; afterId: number | null }): Task {
  const t = getTaskRow(ctx, input.id)
  const from = getColumn(ctx, t.columnId)
  const to = getColumn(ctx, input.columnId)
  return ctx.db.transaction(() => {
    const pos = positionForInsert(ctx.db, 'tasks', 'column_id = ? AND id <> ?', [to.id, t.id], input.beforeId, input.afterId)
    const completed = to.category === 'done' ? (from.category === 'done' && t.completedAt ? t.completedAt : new Date().toISOString()) : null
    ctx.db
      .prepare(`UPDATE tasks SET board_id = ?, column_id = ?, position = ?, completed_at = ?, updated_at = ${TS} WHERE id = ?`)
      .run(to.boardId, to.id, pos, completed, t.id)
    if (from.id !== to.id) {
      logActivity(ctx.db, { entityType: 'task', entityId: t.id, taskId: t.id, action: 'moved', field: 'column', oldValue: from.name, newValue: to.name })
    }
    return getTaskRow(ctx, t.id)
  })()
}

export function setTaskStatus(ctx: AppContext, id: number, status: ColumnCategory): Task {
  const t = getTaskRow(ctx, id)
  const cur = getColumn(ctx, t.columnId)
  if (cur.category === status) return t
  const target = ctx.db
    .prepare('SELECT id FROM columns WHERE board_id = ? AND category = ? ORDER BY position LIMIT 1')
    .get(t.boardId, status) as { id: number } | undefined
  if (!target) throw new AppError('CONFLICT', `Este quadro não tem coluna de "${CATEGORY_LABELS[status]}".`)
  const last = ctx.db.prepare('SELECT id FROM tasks WHERE column_id = ? ORDER BY position DESC LIMIT 1').get(target.id) as { id: number } | undefined
  return moveTask(ctx, { id, columnId: target.id, beforeId: last?.id ?? null, afterId: null })
}
