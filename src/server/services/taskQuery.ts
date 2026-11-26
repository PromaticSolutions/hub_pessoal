import type { Priority, Task, TaskFilter, TaskListItem, TaskSort } from '@shared/types'
import { addDays, dueEnd, getWeekRange as weekRange, parseLocalDate, toLocalDate, toLocalMinute } from '@shared/dates'
import type { AppContext } from '../context'
import { withTx } from '../db/tx'
import { AppError } from '../lib/errors'
import { getSetting, setSetting } from './settings'
import { CARD_COLS, toCards } from './cards'
import { createBoard } from './boards'
import { createTask } from './tasks'

export const getWeekRange = weekRange
export { bucketByWeek } from '@shared/week'

const PRIO_SQL = "CASE t.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END"

/** UTC ISO instant of local midnight of a 'YYYY-MM-DD' day (created_at is stored as UTC ISO text). */
const localDayStart = (day: string) => parseLocalDate(day).toISOString()

export function buildTaskWhere(ctx: AppContext, f: TaskFilter): { where: string; params: unknown[] } {
  const w: string[] = []
  const p: unknown[] = []
  const inList = (col: string, vals: unknown[] | undefined) => {
    if (!vals?.length) return
    w.push(`${col} = ANY(?)`)
    p.push(vals)
  }
  if (!f.includeArchived) w.push('t.effective_archived = 0')
  inList('t.company_id', f.companyIds)
  inList('t.project_id', f.projectIds)
  inList('t.status', f.statuses)
  inList('t.priority', f.priorities)
  if (f.labelIds?.length) {
    w.push('EXISTS (SELECT 1 FROM task_labels tl WHERE tl.task_id = t.id AND tl.label_id = ANY(?))')
    p.push(f.labelIds)
  }
  if (f.dueFrom) { w.push('substr(t.due_at, 1, 10) >= ?'); p.push(f.dueFrom) }
  if (f.dueTo) { w.push('substr(t.due_at, 1, 10) <= ?'); p.push(f.dueTo) }
  if (f.scope === 'personal') w.push('t.is_personal = 1')
  if (f.scope === 'professional') w.push('t.is_personal = 0')
  if (f.overdueOnly) { w.push("t.status <> 'done' AND t.due_end < ?"); p.push(toLocalMinute(ctx.now())) }
  if (f.noDueOnly) w.push('t.due_at IS NULL')
  if (f.includeDone === false) w.push("t.status <> 'done'")
  if (f.text?.trim()) { w.push('t.title ILIKE ?'); p.push(`%${f.text.trim()}%`) }
  if (f.createdFrom) { w.push('t.created_at >= ?'); p.push(localDayStart(f.createdFrom)) }
  if (f.createdTo) { w.push('t.created_at < ?'); p.push(addDays(parseLocalDate(f.createdTo), 1).toISOString()) }
  return { where: w.length ? w.join(' AND ') : 'TRUE', params: p }
}

export async function decorate(ctx: AppContext, rows: Record<string, unknown>[]): Promise<TaskListItem[]> {
  const now = ctx.now()
  const nowMin = toLocalMinute(now)
  const nearDays = await getSetting(ctx.db, 'nearDueDays', 7)
  const limit = toLocalDate(addDays(now, nearDays))
  const items = await toCards<TaskListItem>(ctx, rows)
  const scheduled = new Set<number>()
  const ids = items.map((t) => t.id)
  if (ids.length) {
    const rs = await ctx.db.many<{ task_id: number }>('SELECT DISTINCT task_id FROM day_blocks WHERE date >= ? AND task_id = ANY(?)', [toLocalDate(now), ids])
    for (const r of rs) scheduled.add(r.task_id)
  }
  return items.map((t) => {
    t.scheduled = scheduled.has(t.id)
    const end = dueEnd(t.dueAt)
    t.isPersonal = Boolean(t.isPersonal)
    t.isNearDue = !!end && t.status !== 'done' && end >= nowMin && end.slice(0, 10) <= limit
    return t
  })
}

export const LIST_COLS = `${CARD_COLS}, t.board_name, t.project_id, t.project_name, t.project_color, t.company_id, t.company_name, t.company_color, t.is_personal, t.updated_at`

export async function queryTasks(ctx: AppContext, input: { filter: TaskFilter; sort: TaskSort; limit?: number }): Promise<TaskListItem[]> {
  const { where, params } = buildTaskWhere(ctx, input.filter)
  const order = {
    due: `t.due_at IS NULL, t.due_end NULLS FIRST, ${PRIO_SQL}, t.id`,
    priority: `${PRIO_SQL}, t.due_at IS NULL, t.due_end NULLS FIRST, t.id`,
    created: 't.created_at DESC, t.id DESC',
    updated: 't.updated_at DESC, t.id DESC',
    status: `CASE t.status WHEN 'todo' THEN 0 WHEN 'in_progress' THEN 1 ELSE 2 END, t.due_at IS NULL, t.due_end NULLS FIRST, ${PRIO_SQL}, t.id`
  }[input.sort]
  const rows = await ctx.db.many(
    `SELECT ${LIST_COLS} FROM v_tasks t WHERE ${where} ORDER BY ${order} ${input.limit ? `LIMIT ${Number(input.limit)}` : ''}`,
    params
  )
  return decorate(ctx, rows)
}

export async function quickCreateTask(
  ctx: AppContext,
  input: { projectId: number; title: string; dueAt?: string | null; priority?: Priority }
): Promise<Task> {
  const proj = await ctx.db.one('SELECT id FROM projects WHERE id = ?', [input.projectId])
  if (!proj) throw new AppError('NOT_FOUND', 'Projeto não encontrado.')
  return withTx(ctx, async (tx) => {
    let board = await tx.db.one<{ id: number }>('SELECT id FROM boards WHERE project_id = ? AND archived_at IS NULL ORDER BY position, id LIMIT 1', [input.projectId])
    if (!board) board = { id: (await createBoard(tx, { projectId: input.projectId, name: 'Quadro principal' })).id }
    let col = await tx.db.one<{ id: number }>("SELECT id FROM columns WHERE board_id = ? AND category = 'todo' ORDER BY position LIMIT 1", [board.id])
    col ??= await tx.db.one<{ id: number }>('SELECT id FROM columns WHERE board_id = ? ORDER BY position LIMIT 1', [board.id])
    if (!col) throw new AppError('CONFLICT', 'O quadro deste projeto não tem colunas.')
    const t = await createTask(tx, { columnId: col.id, title: input.title, dueAt: input.dueAt ?? null, priority: input.priority })
    await setSetting(tx.db, 'lastProjectId', input.projectId)
    return t
  })
}
