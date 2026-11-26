import type { TaskFilter } from '@shared/types'
import type { CalendarItem } from '@shared/calendar'
import type { AppContext } from '../context'
import { buildTaskWhere, decorate, LIST_COLS } from './taskQuery'

export function getCalendarItems(ctx: AppContext, input: { from: string; to: string; filter: TaskFilter }): CalendarItem[] {
  const { where, params } = buildTaskWhere(ctx, input.filter)
  const rows = ctx.db
    .prepare(
      `SELECT ${LIST_COLS} FROM v_tasks t WHERE ${where} AND (
         (t.due_at IS NOT NULL AND substr(t.due_at, 1, 10) BETWEEN ? AND ?) OR
         (t.start_at IS NOT NULL AND substr(t.start_at, 1, 10) BETWEEN ? AND ?))`
    )
    .all(...params, input.from, input.to, input.from, input.to) as Record<string, unknown>[]
  const items: CalendarItem[] = []
  for (const task of decorate(ctx, rows)) {
    const push = (kind: 'due' | 'start', v: string | null) => {
      if (!v) return
      const date = v.slice(0, 10)
      if (date < input.from || date > input.to) return
      items.push({ kind, date, time: v.length > 10 ? v.slice(11, 16) : null, task })
    }
    push('due', task.dueAt)
    push('start', task.startAt)
  }
  return items
}
