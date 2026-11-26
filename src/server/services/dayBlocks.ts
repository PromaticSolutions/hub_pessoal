import type { TaskListItem } from '@shared/types'
import { toMinutes, fromMinutes } from '@shared/day'
import type { AppContext } from '../context'
import { AppError } from '../lib/errors'
import { camel, must } from '../lib/rows'
import { decorate, LIST_COLS } from './taskQuery'
import { getTaskRow, setTaskStatus } from './tasks'

const TS = "strftime('%Y-%m-%dT%H:%M:%fZ','now')"

export type DayBlock = {
  id: number
  date: string
  startTime: string
  endTime: string
  taskId: number | null
  title: string | null
  note: string
  done: boolean
  color: string | null
}
export type DayBlockView = DayBlock & { task: TaskListItem | null; displayTitle: string; isDone: boolean }

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const TIME_RE = /^(?:[01]\d|2[0-3]):[0-5]\d$|^24:00$/

function validate(b: { date: string; startTime: string; endTime: string; taskId: number | null; title: string | null }) {
  if (!DATE_RE.test(b.date)) throw new AppError('VALIDATION', 'Data inválida.')
  for (const t of [b.startTime, b.endTime]) {
    if (!TIME_RE.test(t) || toMinutes(t) % 5 !== 0) throw new AppError('VALIDATION', `Horário inválido: ${t}.`)
  }
  if (toMinutes(b.endTime) <= toMinutes(b.startTime)) throw new AppError('VALIDATION', 'O horário final precisa ser depois do inicial.')
  if (b.taskId == null && !b.title?.trim()) throw new AppError('VALIDATION', 'Escolha uma tarefa ou informe a atividade.')
}

function getBlock(ctx: AppContext, id: number): DayBlock {
  const row = must(ctx.db.prepare('SELECT * FROM day_blocks WHERE id = ?').get(id) as Record<string, unknown>, 'Bloco')
  const b = camel<DayBlock>(row)
  return { ...b, done: Boolean(b.done) }
}

export function listBlocks(ctx: AppContext, input: { date: string }): DayBlockView[] {
  const rows = (ctx.db.prepare('SELECT * FROM day_blocks WHERE date = ? ORDER BY start_time, end_time, id').all(input.date) as Record<string, unknown>[]).map((r) => {
    const b = camel<DayBlock>(r)
    return { ...b, done: Boolean(b.done) }
  })
  const taskIds = [...new Set(rows.map((b) => b.taskId).filter((x): x is number => x != null))]
  const tasks = new Map<number, TaskListItem>()
  if (taskIds.length) {
    const trows = ctx.db.prepare(`SELECT ${LIST_COLS} FROM v_tasks t WHERE t.id IN (${taskIds.map(() => '?').join(',')})`).all(...taskIds) as Record<string, unknown>[]
    for (const t of decorate(ctx, trows)) tasks.set(t.id, t)
  }
  return rows.map((b) => {
    const task = b.taskId != null ? tasks.get(b.taskId) ?? null : null
    return { ...b, task, displayTitle: task?.title ?? b.title ?? '', isDone: task ? task.status === 'done' : b.done }
  })
}

export function createBlock(
  ctx: AppContext,
  input: { date: string; startTime: string; endTime: string; taskId?: number | null; title?: string | null; note?: string; color?: string | null }
): DayBlock {
  const b = { date: input.date, startTime: input.startTime, endTime: input.endTime, taskId: input.taskId ?? null, title: input.title?.trim() || null }
  validate(b)
  if (b.taskId != null) getTaskRow(ctx, b.taskId)
  const id = ctx.db
    .prepare('INSERT INTO day_blocks(date, start_time, end_time, task_id, title, note, color) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(b.date, b.startTime, b.endTime, b.taskId, b.taskId != null ? null : b.title, input.note ?? '', input.color ?? null).lastInsertRowid as number
  return getBlock(ctx, id)
}

export function updateBlock(
  ctx: AppContext,
  id: number,
  patch: Partial<{ date: string; startTime: string; endTime: string; taskId: number | null; title: string | null; note: string; color: string | null }>
): DayBlock {
  const cur = getBlock(ctx, id)
  const next = { ...cur, ...patch }
  next.title = next.title?.trim() || null
  validate(next)
  if (next.taskId != null && next.taskId !== cur.taskId) getTaskRow(ctx, next.taskId)
  ctx.db
    .prepare(`UPDATE day_blocks SET date=?, start_time=?, end_time=?, task_id=?, title=?, note=?, color=?, updated_at=${TS} WHERE id=?`)
    .run(next.date, next.startTime, next.endTime, next.taskId, next.taskId != null ? null : next.title, next.note, next.color, id)
  return getBlock(ctx, id)
}

/** Moves a block keeping its duration; it never crosses 24:00. */
export function moveBlock(ctx: AppContext, input: { id: number; date: string; startTime: string }): DayBlock {
  const cur = getBlock(ctx, input.id)
  const duration = toMinutes(cur.endTime) - toMinutes(cur.startTime)
  const start = Math.min(Math.max(0, toMinutes(input.startTime)), 1440 - duration)
  return updateBlock(ctx, input.id, { date: input.date, startTime: fromMinutes(start), endTime: fromMinutes(start + duration) })
}

export function setBlockDone(ctx: AppContext, id: number, done: boolean): DayBlock {
  const b = getBlock(ctx, id)
  if (b.taskId != null) setTaskStatus(ctx, b.taskId, done ? 'done' : 'todo')
  else ctx.db.prepare(`UPDATE day_blocks SET done = ?, updated_at = ${TS} WHERE id = ?`).run(done ? 1 : 0, id)
  return getBlock(ctx, id)
}

export function deleteBlock(ctx: AppContext, id: number): void {
  getBlock(ctx, id)
  ctx.db.prepare('DELETE FROM day_blocks WHERE id = ?').run(id)
}

/** Copies free activities and blocks of still-open tasks from one day to another; skips identical blocks. */
export function copyFromDay(ctx: AppContext, input: { from: string; to: string }): number {
  if (!DATE_RE.test(input.from) || !DATE_RE.test(input.to)) throw new AppError('VALIDATION', 'Data inválida.')
  const src = listBlocks(ctx, { date: input.from }).filter((b) => (b.taskId == null ? true : b.task?.status !== 'done'))
  const exists = ctx.db.prepare('SELECT 1 FROM day_blocks WHERE date = ? AND start_time = ? AND end_time = ? AND task_id IS ? AND title IS ?')
  let n = 0
  ctx.db.transaction(() => {
    for (const b of src) {
      if (exists.get(input.to, b.startTime, b.endTime, b.taskId, b.taskId != null ? null : b.title)) continue
      createBlock(ctx, { date: input.to, startTime: b.startTime, endTime: b.endTime, taskId: b.taskId, title: b.title, note: b.note, color: b.color })
      n++
    }
  })()
  return n
}

export function scheduledFor(ctx: AppContext, taskId: number, fromDate: string): { date: string; startTime: string; endTime: string }[] {
  return (ctx.db
    .prepare('SELECT date, start_time, end_time FROM day_blocks WHERE task_id = ? AND date >= ? ORDER BY date, start_time')
    .all(taskId, fromDate) as { date: string; start_time: string; end_time: string }[]).map((r) => ({ date: r.date, startTime: r.start_time, endTime: r.end_time }))
}
