import type { Priority, Task, TaskFilter, TaskListItem, TaskSort } from '@shared/types'
import { PRIORITY_ORDER } from '@shared/constants'
import { addDays, dueEnd, getWeekRange as weekRange, toLocalDate, toLocalMinute } from '@shared/dates'
import type { AppContext } from '../context'
import { AppError } from '../lib/errors'
import { getSetting, setSetting } from './settings'
import { CARD_COLS, toCards } from './cards'
import { createBoard } from './boards'
import { createTask } from './tasks'

export const getWeekRange = weekRange
export { bucketByWeek } from '@shared/week'

const PRIO_SQL = "CASE t.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END"

export function buildTaskWhere(ctx: AppContext, f: TaskFilter): { where: string; params: unknown[] } {
  const w: string[] = []
  const p: unknown[] = []
  const inList = (col: string, vals: unknown[] | undefined) => {
    if (!vals?.length) return
    w.push(`${col} IN (${vals.map(() => '?').join(',')})`)
    p.push(...vals)
  }
  if (!f.includeArchived) w.push('NOT t.effective_archived')
  inList('t.company_id', f.companyIds)
  inList('t.project_id', f.projectIds)
  inList('t.status', f.statuses)
  inList('t.priority', f.priorities)
  if (f.labelIds?.length) {
    w.push(`EXISTS (SELECT 1 FROM task_labels tl WHERE tl.task_id = t.id AND tl.label_id IN (${f.labelIds.map(() => '?').join(',')}))`)
    p.push(...f.labelIds)
  }
  if (f.dueFrom) { w.push('substr(t.due_at, 1, 10) >= ?'); p.push(f.dueFrom) }
  if (f.dueTo) { w.push('substr(t.due_at, 1, 10) <= ?'); p.push(f.dueTo) }
  if (f.scope === 'personal') w.push('t.is_personal = 1')
  if (f.scope === 'professional') w.push('t.is_personal = 0')
  if (f.overdueOnly) { w.push("t.status <> 'done' AND t.due_end < ?"); p.push(toLocalMinute(ctx.now())) }
  if (f.noDueOnly) w.push('t.due_at IS NULL')
  if (f.includeDone === false) w.push("t.status <> 'done'")
  if (f.text?.trim()) { w.push('t.title LIKE ?'); p.push(`%${f.text.trim()}%`) }
  return { where: w.length ? w.join(' AND ') : '1', params: p }
}

export function decorate(ctx: AppContext, rows: Record<string, unknown>[]): TaskListItem[] {
  const now = ctx.now()
  const nowMin = toLocalMinute(now)
  const nearDays = getSetting(ctx.db, 'nearDueDays', 7)
  const limit = toLocalDate(addDays(now, nearDays))
  return toCards<TaskListItem>(ctx, rows).map((t) => {
    const end = dueEnd(t.dueAt)
    t.isPersonal = Boolean(t.isPersonal)
    t.isNearDue = !!end && t.status !== 'done' && end >= nowMin && end.slice(0, 10) <= limit
    return t
  })
}

export const LIST_COLS = `${CARD_COLS}, t.board_name, t.project_id, t.project_name, t.project_color, t.company_id, t.company_name, t.company_color, t.is_personal, t.updated_at`

export function queryTasks(ctx: AppContext, input: { filter: TaskFilter; sort: TaskSort; limit?: number }): TaskListItem[] {
  const { where, params } = buildTaskWhere(ctx, input.filter)
  const order = {
    due: `t.due_at IS NULL, t.due_end, ${PRIO_SQL}, t.id`,
    priority: `${PRIO_SQL}, t.due_at IS NULL, t.due_end, t.id`,
    created: 't.created_at DESC, t.id DESC',
    updated: 't.updated_at DESC, t.id DESC'
  }[input.sort]
  const rows = ctx.db
    .prepare(`SELECT ${LIST_COLS} FROM v_tasks t WHERE ${where} ORDER BY ${order} ${input.limit ? `LIMIT ${Number(input.limit)}` : ''}`)
    .all(...params) as Record<string, unknown>[]
  return decorate(ctx, rows)
}

export function quickCreateTask(ctx: AppContext, input: { projectId: number; title: string; dueAt?: string | null; priority?: Priority }): Task {
  const proj = ctx.db.prepare('SELECT id FROM projects WHERE id = ?').get(input.projectId)
  if (!proj) throw new AppError('NOT_FOUND', 'Projeto não encontrado.')
  return ctx.db.transaction(() => {
    let board = ctx.db.prepare('SELECT id FROM boards WHERE project_id = ? AND archived_at IS NULL ORDER BY position, id LIMIT 1').get(input.projectId) as { id: number } | undefined
    if (!board) board = { id: createBoard(ctx, { projectId: input.projectId, name: 'Quadro principal' }).id }
    let col = ctx.db.prepare("SELECT id FROM columns WHERE board_id = ? AND category = 'todo' ORDER BY position LIMIT 1").get(board.id) as { id: number } | undefined
    col ??= ctx.db.prepare('SELECT id FROM columns WHERE board_id = ? ORDER BY position LIMIT 1').get(board.id) as { id: number } | undefined
    if (!col) throw new AppError('CONFLICT', 'O quadro deste projeto não tem colunas.')
    const t = createTask(ctx, { columnId: col.id, title: input.title, dueAt: input.dueAt ?? null, priority: input.priority })
    setSetting(ctx.db, 'lastProjectId', input.projectId)
    return t
  })()
}
