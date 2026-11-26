import type { TaskListItem } from '@shared/types'
import { toMinutes, fromMinutes } from '@shared/day'
import type { AppContext } from '../context'
import { AppError } from '../lib/errors'
import { withTx } from '../db/tx'
import { camel, insertId, must } from '../lib/rows'
import { decorate, LIST_COLS } from './taskQuery'
import { getTaskRow, setTaskStatus } from './tasks'


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

async function getBlock(ctx: AppContext, id: number): Promise<DayBlock> {
  const row = must(await ctx.db.one<Record<string, unknown>>('SELECT * FROM day_blocks WHERE id = ?', [id]), 'Bloco')
  const b = camel<DayBlock>(row)
  return { ...b, done: Boolean(b.done) }
}

export async function listBlocks(ctx: AppContext, input: { date: string }): Promise<DayBlockView[]> {
  const rows = (await ctx.db.many('SELECT * FROM day_blocks WHERE date = ? ORDER BY start_time, end_time, id', [input.date])).map((r) => {
    const b = camel<DayBlock>(r)
    return { ...b, done: Boolean(b.done) }
  })
  const taskIds = [...new Set(rows.map((b) => b.taskId).filter((x): x is number => x != null))]
  const tasks = new Map<number, TaskListItem>()
  if (taskIds.length) {
    const trows = await ctx.db.many(`SELECT ${LIST_COLS} FROM v_tasks t WHERE t.id = ANY(?)`, [taskIds])
    for (const t of await decorate(ctx, trows)) tasks.set(t.id, t)
  }
  return rows.map((b) => {
    const task = b.taskId != null ? tasks.get(b.taskId) ?? null : null
    return { ...b, task, displayTitle: task?.title ?? b.title ?? '', isDone: task ? task.status === 'done' : b.done }
  })
}

export async function createBlock(
  ctx: AppContext,
  input: { date: string; startTime: string; endTime: string; taskId?: number | null; title?: string | null; note?: string; color?: string | null }
): Promise<DayBlock> {
  const b = { date: input.date, startTime: input.startTime, endTime: input.endTime, taskId: input.taskId ?? null, title: input.title?.trim() || null }
  validate(b)
  if (b.taskId != null) await getTaskRow(ctx, b.taskId)
  const id = await insertId(ctx.db, 'INSERT INTO day_blocks(date, start_time, end_time, task_id, title, note, color) VALUES (?, ?, ?, ?, ?, ?, ?)', [
    b.date,
    b.startTime,
    b.endTime,
    b.taskId,
    b.taskId != null ? null : b.title,
    input.note ?? '',
    input.color ?? null
  ])
  return getBlock(ctx, id)
}

export async function updateBlock(
  ctx: AppContext,
  id: number,
  patch: Partial<{ date: string; startTime: string; endTime: string; taskId: number | null; title: string | null; note: string; color: string | null }>
): Promise<DayBlock> {
  const cur = await getBlock(ctx, id)
  const next = { ...cur, ...patch }
  next.title = next.title?.trim() || null
  validate(next)
  if (next.taskId != null && next.taskId !== cur.taskId) await getTaskRow(ctx, next.taskId)
  await ctx.db.run('UPDATE day_blocks SET date=?, start_time=?, end_time=?, task_id=?, title=?, note=?, color=?, updated_at=iso_now() WHERE id=?', [
    next.date,
    next.startTime,
    next.endTime,
    next.taskId,
    next.taskId != null ? null : next.title,
    next.note,
    next.color,
    id
  ])
  return getBlock(ctx, id)
}

/** Moves a block keeping its duration; it never crosses 24:00. */
export async function moveBlock(ctx: AppContext, input: { id: number; date: string; startTime: string }): Promise<DayBlock> {
  const cur = await getBlock(ctx, input.id)
  const duration = toMinutes(cur.endTime) - toMinutes(cur.startTime)
  const start = Math.min(Math.max(0, toMinutes(input.startTime)), 1440 - duration)
  return updateBlock(ctx, input.id, { date: input.date, startTime: fromMinutes(start), endTime: fromMinutes(start + duration) })
}

export async function setBlockDone(ctx: AppContext, id: number, done: boolean): Promise<DayBlock> {
  const b = await getBlock(ctx, id)
  if (b.taskId != null) await setTaskStatus(ctx, b.taskId, done ? 'done' : 'todo')
  else await ctx.db.run('UPDATE day_blocks SET done = ?, updated_at = iso_now() WHERE id = ?', [done ? 1 : 0, id])
  return getBlock(ctx, id)
}

export async function deleteBlock(ctx: AppContext, id: number): Promise<void> {
  await getBlock(ctx, id)
  await ctx.db.run('DELETE FROM day_blocks WHERE id = ?', [id])
}

/** Copies free activities and blocks of still-open tasks from one day to another; skips identical blocks. */
export async function copyFromDay(ctx: AppContext, input: { from: string; to: string }): Promise<number> {
  if (!DATE_RE.test(input.from) || !DATE_RE.test(input.to)) throw new AppError('VALIDATION', 'Data inválida.')
  const src = (await listBlocks(ctx, { date: input.from })).filter((b) => (b.taskId == null ? true : b.task?.status !== 'done'))
  return withTx(ctx, async (tx) => {
    let n = 0
    for (const b of src) {
      const exists = await tx.db.one(
        'SELECT 1 FROM day_blocks WHERE date = ? AND start_time = ? AND end_time = ? AND task_id IS NOT DISTINCT FROM ? AND title IS NOT DISTINCT FROM ?',
        [input.to, b.startTime, b.endTime, b.taskId, b.taskId != null ? null : b.title]
      )
      if (exists) continue
      await createBlock(tx, { date: input.to, startTime: b.startTime, endTime: b.endTime, taskId: b.taskId, title: b.title, note: b.note, color: b.color })
      n++
    }
    return n
  })
}

export async function scheduledFor(ctx: AppContext, taskId: number, fromDate: string): Promise<{ date: string; startTime: string; endTime: string }[]> {
  return (
    await ctx.db.many<{ date: string; start_time: string; end_time: string }>(
      'SELECT date, start_time, end_time FROM day_blocks WHERE task_id = ? AND date >= ? ORDER BY date, start_time',
      [taskId, fromDate]
    )
  ).map((r) => ({ date: r.date, startTime: r.start_time, endTime: r.end_time }))
}
