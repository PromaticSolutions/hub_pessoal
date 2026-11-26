import type { CardSummary, Label } from '@shared/types'
import { isOverdue } from '@shared/dates'
import type { AppContext } from '../context'
import { camel } from '../lib/rows'

/** Columns selected from v_tasks t to build a CardSummary (plus any extra columns). */
export const CARD_COLS = `t.id, t.board_id, t.column_id, t.title, t.priority, t.due_at, t.start_at, t.position, t.archived_at,
  t.completed_at, t.created_at, t.status, t.color,
  (SELECT count(*) FROM checklist_items i JOIN checklists l ON l.id = i.checklist_id WHERE l.task_id = t.id AND i.done = 1) AS checklist_done,
  (SELECT count(*) FROM checklist_items i JOIN checklists l ON l.id = i.checklist_id WHERE l.task_id = t.id) AS checklist_total,
  (SELECT count(*) FROM comments m WHERE m.task_id = t.id) AS comment_count,
  (SELECT count(*) FROM attachments a WHERE a.task_id = t.id) AS attachment_count`

export async function labelsFor(ctx: AppContext, taskIds: number[]): Promise<Map<number, Label[]>> {
  const map = new Map<number, Label[]>()
  if (!taskIds.length) return map
  const rows = await ctx.db.many<{ task_id: number; id: number; name: string; color: string }>(
    'SELECT tl.task_id, l.id, l.name, l.color FROM task_labels tl JOIN labels l ON l.id = tl.label_id WHERE tl.task_id = ANY(?) ORDER BY l.name COLLATE "C"',
    [taskIds]
  )
  for (const r of rows) {
    const list = map.get(r.task_id) ?? []
    list.push({ id: r.id, name: r.name, color: r.color })
    map.set(r.task_id, list)
  }
  return map
}

export async function toCards<T extends CardSummary>(ctx: AppContext, rows: Record<string, unknown>[]): Promise<T[]> {
  const now = ctx.now()
  const items = rows.map((r) => camel<T>(r))
  const labels = await labelsFor(ctx, items.map((c) => c.id))
  for (const c of items) {
    c.labels = labels.get(c.id) ?? []
    c.isOverdue = isOverdue(c.dueAt, c.status, now)
  }
  return items
}
