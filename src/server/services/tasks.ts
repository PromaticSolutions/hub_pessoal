import type {
  ActivityEntry, Attachment, Board, Checklist, ChecklistItem, Column, ColumnCategory, Comment, Company, Label, Priority, Project, Task
} from '@shared/types'
import { isOverdue, toLocalDate } from '@shared/dates'
import { scheduledFor } from './dayBlocks'
import { CATEGORY_LABELS } from '@shared/constants'
import type { AppContext } from '../context'
import { AppError } from '../lib/errors'
import { camel, camelAll, must, requireName } from '../lib/rows'
import { positionForInsert } from '../lib/position'
import { logActivity } from '../lib/activity'
import { getColumn } from './columns'
import { labelsFor } from './cards'
import { listChecklists } from './checklists'
import { listComments } from './comments'
import { collectAttachmentPaths, moveToDeleted } from './attachments'

const TS = "strftime('%Y-%m-%dT%H:%M:%fZ','now')"
const nowTs = (ctx: AppContext) => ctx.now().toISOString()

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
        `INSERT INTO tasks(board_id, column_id, title, description, priority, start_at, due_at, completed_at, position, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, CASE WHEN ? = 'done' THEN ? END, ?, ?, ?)`
      )
      .run(col.boardId, col.id, title, input.description ?? '', input.priority ?? 'medium', input.startAt ?? null, input.dueAt ?? null, col.category, nowTs(ctx), pos, nowTs(ctx), nowTs(ctx))
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
    const completed = to.category === 'done' ? (from.category === 'done' && t.completedAt ? t.completedAt : nowTs(ctx)) : null
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

export function getTask(ctx: AppContext, id: number): TaskDetail {
  const t = getTaskRow(ctx, id)
  const column = getColumn(ctx, t.columnId)
  const board = camel<Board>(ctx.db.prepare('SELECT * FROM boards WHERE id = ?').get(t.boardId) as Record<string, unknown>)
  const project = camel<Project>(ctx.db.prepare('SELECT * FROM projects WHERE id = ?').get(board.projectId) as Record<string, unknown>)
  const company = camel<Company>(ctx.db.prepare('SELECT * FROM companies WHERE id = ?').get(project.companyId) as Record<string, unknown>)
  return {
    ...t,
    status: column.category,
    column,
    board,
    project,
    company,
    labels: labelsFor(ctx, [id]).get(id) ?? [],
    checklists: listChecklists(ctx, id),
    comments: listComments(ctx, id),
    attachments: camelAll<Attachment>(ctx.db.prepare('SELECT * FROM attachments WHERE task_id = ? ORDER BY created_at, id').all(id)),
    isOverdue: isOverdue(t.dueAt, column.category, ctx.now()),
    scheduled: scheduledFor(ctx, id, toLocalDate(ctx.now()))
  }
}

export function updateTask(
  ctx: AppContext,
  id: number,
  patch: Partial<{ title: string; description: string; priority: Priority; startAt: string | null; dueAt: string | null; color: string | null }>
): Task {
  const cur = getTaskRow(ctx, id)
  if (patch.color !== undefined) ctx.db.prepare('UPDATE tasks SET color = ? WHERE id = ?').run(patch.color, id)
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
  ctx.db.transaction(() => {
    ctx.db
      .prepare(`UPDATE tasks SET title=?, description=?, priority=?, start_at=?, due_at=?, updated_at=${TS} WHERE id=?`)
      .run(next.title, next.description, next.priority, next.startAt, next.dueAt, id)
    for (const k of Object.keys(next) as (keyof typeof next)[]) {
      if (next[k] !== cur[k]) {
        const long = k === 'description'
        logActivity(ctx.db, { entityType: 'task', entityId: id, taskId: id, action: 'updated', field: k, oldValue: long ? null : cur[k], newValue: long ? null : next[k] })
      }
    }
  })()
  return getTaskRow(ctx, id)
}

export function setTaskLabels(ctx: AppContext, taskId: number, labelIds: number[]): void {
  getTaskRow(ctx, taskId)
  const before = (labelsFor(ctx, [taskId]).get(taskId) ?? []).map((l) => l.name)
  ctx.db.transaction(() => {
    ctx.db.prepare('DELETE FROM task_labels WHERE task_id = ?').run(taskId)
    const ins = ctx.db.prepare('INSERT OR IGNORE INTO task_labels(task_id, label_id) VALUES (?, ?)')
    for (const l of labelIds) ins.run(taskId, l)
    const after = (labelsFor(ctx, [taskId]).get(taskId) ?? []).map((l) => l.name)
    if (before.join('|') !== after.join('|')) {
      logActivity(ctx.db, { entityType: 'task', entityId: taskId, taskId, action: 'updated', field: 'labels', oldValue: before.join(', '), newValue: after.join(', ') })
    }
  })()
}

export function duplicateTask(ctx: AppContext, id: number): Task {
  const src = getTask(ctx, id)
  return ctx.db.transaction(() => {
    const copy = createTask(ctx, {
      columnId: src.columnId,
      title: `${src.title} (cópia)`,
      afterId: src.id,
      description: src.description,
      priority: src.priority,
      startAt: src.startAt,
      dueAt: src.dueAt
    })
    const insL = ctx.db.prepare('INSERT INTO task_labels(task_id, label_id) VALUES (?, ?)')
    for (const l of src.labels) insL.run(copy.id, l.id)
    for (const cl of src.checklists) {
      const nc = ctx.db.prepare('INSERT INTO checklists(task_id, title, position) VALUES (?, ?, ?)').run(copy.id, cl.title, cl.position).lastInsertRowid
      const insI = ctx.db.prepare('INSERT INTO checklist_items(checklist_id, text, position) VALUES (?, ?, ?)')
      for (const it of cl.items) insI.run(nc, it.text, it.position)
    }
    logActivity(ctx.db, { entityType: 'task', entityId: copy.id, taskId: copy.id, action: 'duplicated', newValue: { duplicatedFrom: id } })
    return getTaskRow(ctx, copy.id)
  })()
}

export function archiveTask(ctx: AppContext, id: number): Task {
  getTaskRow(ctx, id)
  ctx.db.prepare(`UPDATE tasks SET archived_at = ${TS}, updated_at = ${TS} WHERE id = ?`).run(id)
  logActivity(ctx.db, { entityType: 'task', entityId: id, taskId: id, action: 'archived' })
  return getTaskRow(ctx, id)
}

export function restoreTask(ctx: AppContext, id: number): Task {
  getTaskRow(ctx, id)
  ctx.db.prepare(`UPDATE tasks SET archived_at = NULL, updated_at = ${TS} WHERE id = ?`).run(id)
  logActivity(ctx.db, { entityType: 'task', entityId: id, taskId: id, action: 'restored' })
  return getTaskRow(ctx, id)
}

export function deleteTask(ctx: AppContext, id: number): void {
  getTaskRow(ctx, id)
  const files = collectAttachmentPaths(ctx.db, 'a.task_id = ?', [id])
  ctx.db.prepare('DELETE FROM tasks WHERE id = ?').run(id)
  for (const f of files) moveToDeleted(ctx.paths, f)
}

export function listActivity(ctx: AppContext, taskId: number): ActivityEntry[] {
  return camelAll<ActivityEntry>(ctx.db.prepare('SELECT * FROM activity_log WHERE task_id = ? ORDER BY created_at DESC, id DESC').all(taskId))
}
