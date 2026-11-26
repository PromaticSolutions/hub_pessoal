import type {
  ActivityEntry, Attachment, Board, Checklist, ChecklistItem, Column, ColumnCategory, Comment, Company, Label, Priority, Project, Task
} from '@shared/types'
import { isOverdue, toLocalDate } from '@shared/dates'
import { scheduledFor } from './dayBlocks'
import { CATEGORY_LABELS } from '@shared/constants'
import type { AppContext } from '../context'
import { withTx } from '../db/tx'
import { AppError } from '../lib/errors'
import { camel, camelAll, insertId, must, requireName } from '../lib/rows'
import { positionForInsert } from '../lib/position'
import { logActivity } from '../lib/activity'
import { getColumn } from './columns'
import { labelsFor } from './cards'
import { listChecklists } from './checklists'
import { listComments } from './comments'
import { collectAttachmentPaths, moveToDeleted } from './attachments'

const nowTs = (ctx: AppContext) => ctx.now().toISOString()

export async function getTaskRow(ctx: AppContext, id: number): Promise<Task> {
  return camel<Task>(must(await ctx.db.one('SELECT * FROM tasks WHERE id = ?', [id]), 'Tarefa'))
}

export async function createTask(
  ctx: AppContext,
  input: { columnId: number; title: string; afterId?: number | null; description?: string; priority?: Priority; startAt?: string | null; dueAt?: string | null }
): Promise<Task> {
  const title = requireName(input.title, 'Título')
  const col = await getColumn(ctx, input.columnId)
  return withTx(ctx, async (tx) => {
    let beforeId: number | null = null
    let afterId: number | null = null
    if (input.afterId != null) {
      beforeId = input.afterId
      const next = await tx.db.one<{ id: number }>(
        'SELECT id FROM tasks WHERE column_id = ? AND position > (SELECT position FROM tasks WHERE id = ?) ORDER BY position LIMIT 1',
        [col.id, input.afterId]
      )
      afterId = next?.id ?? null
    }
    const pos = await positionForInsert(tx.db, 'tasks', 'column_id = ?', [col.id], beforeId, afterId)
    const ts = nowTs(tx)
    const id = await insertId(
      tx.db,
      `INSERT INTO tasks(board_id, column_id, title, description, priority, start_at, due_at, completed_at, position, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [col.boardId, col.id, title, input.description ?? '', input.priority ?? 'medium', input.startAt ?? null, input.dueAt ?? null,
        col.category === 'done' ? ts : null, pos, ts, ts]
    )
    await logActivity(tx.db, { entityType: 'task', entityId: id, taskId: id, action: 'created' })
    return getTaskRow(tx, id)
  })
}

export async function moveTask(ctx: AppContext, input: { id: number; columnId: number; beforeId: number | null; afterId: number | null }): Promise<Task> {
  const t = await getTaskRow(ctx, input.id)
  const from = await getColumn(ctx, t.columnId)
  const to = await getColumn(ctx, input.columnId)
  return withTx(ctx, async (tx) => {
    const pos = await positionForInsert(tx.db, 'tasks', 'column_id = ? AND id <> ?', [to.id, t.id], input.beforeId, input.afterId)
    const completed = to.category === 'done' ? (from.category === 'done' && t.completedAt ? t.completedAt : nowTs(tx)) : null
    await tx.db.run('UPDATE tasks SET board_id = ?, column_id = ?, position = ?, completed_at = ?, updated_at = iso_now() WHERE id = ?', [
      to.boardId,
      to.id,
      pos,
      completed,
      t.id
    ])
    if (from.id !== to.id) {
      await logActivity(tx.db, { entityType: 'task', entityId: t.id, taskId: t.id, action: 'moved', field: 'column', oldValue: from.name, newValue: to.name })
    }
    return getTaskRow(tx, t.id)
  })
}

export async function setTaskStatus(ctx: AppContext, id: number, status: ColumnCategory): Promise<Task> {
  const t = await getTaskRow(ctx, id)
  const cur = await getColumn(ctx, t.columnId)
  if (cur.category === status) return t
  const target = await ctx.db.one<{ id: number }>('SELECT id FROM columns WHERE board_id = ? AND category = ? ORDER BY position LIMIT 1', [t.boardId, status])
  if (!target) throw new AppError('CONFLICT', `Este quadro não tem coluna de "${CATEGORY_LABELS[status]}".`)
  const last = await ctx.db.one<{ id: number }>('SELECT id FROM tasks WHERE column_id = ? ORDER BY position DESC LIMIT 1', [target.id])
  return moveTask(ctx, { id, columnId: target.id, beforeId: last?.id ?? null, afterId: null })
}

/* ---------- detail ---------- */

export type TaskDetail = Task & {
  status: ColumnCategory
  column: Column
  board: Board
  project: Project
  company: Company
  labels: Label[]
  checklists: (Checklist & { items: ChecklistItem[] })[]
  comments: Comment[]
  attachments: Attachment[]
  isOverdue: boolean
  scheduled: { date: string; startTime: string; endTime: string }[]
}

export async function getTask(ctx: AppContext, id: number): Promise<TaskDetail> {
  const t = await getTaskRow(ctx, id)
  const column = await getColumn(ctx, t.columnId)
  const board = camel<Board>((await ctx.db.one('SELECT * FROM boards WHERE id = ?', [t.boardId]))!)
  const project = camel<Project>((await ctx.db.one('SELECT * FROM projects WHERE id = ?', [board.projectId]))!)
  const company = camel<Company>((await ctx.db.one('SELECT * FROM companies WHERE id = ?', [project.companyId]))!)
  return {
    ...t,
    status: column.category,
    column,
    board,
    project,
    company,
    labels: (await labelsFor(ctx, [id])).get(id) ?? [],
    checklists: await listChecklists(ctx, id),
    comments: await listComments(ctx, id),
    attachments: camelAll<Attachment>(await ctx.db.many('SELECT * FROM attachments WHERE task_id = ? ORDER BY created_at, id', [id])),
    isOverdue: isOverdue(t.dueAt, column.category, ctx.now()),
    scheduled: await scheduledFor(ctx, id, toLocalDate(ctx.now()))
  }
}

const TASK_FIELDS = { title: 'title', description: 'description', priority: 'priority', startAt: 'start_at', dueAt: 'due_at' } as const

/** Writes only the fields present in `patch` (two open editors never overwrite each other's fields). */
export async function updateTask(
  ctx: AppContext,
  id: number,
  patch: Partial<{ title: string; description: string; priority: Priority; startAt: string | null; dueAt: string | null; color: string | null }>
): Promise<Task> {
  const cur = await getTaskRow(ctx, id)
  if (patch.color !== undefined) await ctx.db.run('UPDATE tasks SET color = ? WHERE id = ?', [patch.color, id])
  const next = {
    title: patch.title !== undefined ? requireName(patch.title, 'Título') : cur.title,
    description: patch.description ?? cur.description,
    priority: patch.priority ?? cur.priority,
    startAt: patch.startAt !== undefined ? patch.startAt || null : cur.startAt,
    dueAt: patch.dueAt !== undefined ? patch.dueAt || null : cur.dueAt
  }
  if (next.startAt && next.dueAt && next.startAt.slice(0, 16) > (next.dueAt.length === 10 ? `${next.dueAt}T23:59` : next.dueAt)) {
    throw new AppError('VALIDATION', 'Início depois do vencimento.')
  }
  const keys = (Object.keys(TASK_FIELDS) as (keyof typeof next)[]).filter((k) => patch[k] !== undefined)
  await withTx(ctx, async (tx) => {
    const sets = [...keys.map((k) => `${TASK_FIELDS[k]} = ?`), 'updated_at = iso_now()']
    await tx.db.run(`UPDATE tasks SET ${sets.join(', ')} WHERE id = ?`, [...keys.map((k) => next[k]), id])
    for (const k of keys) {
      if (next[k] !== cur[k]) {
        const long = k === 'description'
        await logActivity(tx.db, { entityType: 'task', entityId: id, taskId: id, action: 'updated', field: k, oldValue: long ? null : cur[k], newValue: long ? null : next[k] })
      }
    }
  })
  return getTaskRow(ctx, id)
}

export async function setTaskLabels(ctx: AppContext, taskId: number, labelIds: number[]): Promise<void> {
  await getTaskRow(ctx, taskId)
  const before = ((await labelsFor(ctx, [taskId])).get(taskId) ?? []).map((l) => l.name)
  await withTx(ctx, async (tx) => {
    await tx.db.run('DELETE FROM task_labels WHERE task_id = ?', [taskId])
    for (const l of labelIds) await tx.db.run('INSERT INTO task_labels(task_id, label_id) VALUES (?, ?) ON CONFLICT DO NOTHING', [taskId, l])
    const after = ((await labelsFor(tx, [taskId])).get(taskId) ?? []).map((l) => l.name)
    if (before.join('|') !== after.join('|')) {
      await logActivity(tx.db, { entityType: 'task', entityId: taskId, taskId, action: 'updated', field: 'labels', oldValue: before.join(', '), newValue: after.join(', ') })
    }
  })
}

export async function duplicateTask(ctx: AppContext, id: number): Promise<Task> {
  const src = await getTask(ctx, id)
  return withTx(ctx, async (tx) => {
    const copy = await createTask(tx, {
      columnId: src.columnId,
      title: `${src.title} (cópia)`,
      afterId: src.id,
      description: src.description,
      priority: src.priority,
      startAt: src.startAt,
      dueAt: src.dueAt
    })
    for (const l of src.labels) await tx.db.run('INSERT INTO task_labels(task_id, label_id) VALUES (?, ?)', [copy.id, l.id])
    for (const cl of src.checklists) {
      const nc = await insertId(tx.db, 'INSERT INTO checklists(task_id, title, position) VALUES (?, ?, ?)', [copy.id, cl.title, cl.position])
      for (const it of cl.items) await tx.db.run('INSERT INTO checklist_items(checklist_id, text, position) VALUES (?, ?, ?)', [nc, it.text, it.position])
    }
    await logActivity(tx.db, { entityType: 'task', entityId: copy.id, taskId: copy.id, action: 'duplicated', newValue: { duplicatedFrom: id } })
    return getTaskRow(tx, copy.id)
  })
}

export async function archiveTask(ctx: AppContext, id: number): Promise<Task> {
  await getTaskRow(ctx, id)
  await ctx.db.run('UPDATE tasks SET archived_at = iso_now(), updated_at = iso_now() WHERE id = ?', [id])
  await logActivity(ctx.db, { entityType: 'task', entityId: id, taskId: id, action: 'archived' })
  return getTaskRow(ctx, id)
}

export async function restoreTask(ctx: AppContext, id: number): Promise<Task> {
  await getTaskRow(ctx, id)
  await ctx.db.run('UPDATE tasks SET archived_at = NULL, updated_at = iso_now() WHERE id = ?', [id])
  await logActivity(ctx.db, { entityType: 'task', entityId: id, taskId: id, action: 'restored' })
  return getTaskRow(ctx, id)
}

export async function deleteTask(ctx: AppContext, id: number): Promise<void> {
  await getTaskRow(ctx, id)
  const files = await collectAttachmentPaths(ctx.db, 'a.task_id = ?', [id])
  await ctx.db.run('DELETE FROM tasks WHERE id = ?', [id])
  for (const f of files) await moveToDeleted(ctx.storage, f)
}

export async function listActivity(ctx: AppContext, taskId: number): Promise<ActivityEntry[]> {
  return camelAll<ActivityEntry>(await ctx.db.many('SELECT * FROM activity_log WHERE task_id = ? ORDER BY created_at DESC, id DESC', [taskId]))
}
