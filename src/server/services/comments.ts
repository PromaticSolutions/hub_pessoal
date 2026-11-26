import type { Comment } from '@shared/types'
import type { AppContext } from '../context'
import { camel, camelAll, must, requireName } from '../lib/rows'
import { logActivity } from '../lib/activity'

const TS = "strftime('%Y-%m-%dT%H:%M:%fZ','now')"

function getComment(ctx: AppContext, id: number): Comment {
  return camel<Comment>(must(ctx.db.prepare('SELECT * FROM comments WHERE id = ?').get(id) as Record<string, unknown>, 'Comentário'))
}

export function listComments(ctx: AppContext, taskId: number): Comment[] {
  return camelAll<Comment>(ctx.db.prepare('SELECT * FROM comments WHERE task_id = ? ORDER BY created_at, id').all(taskId))
}

export function addComment(ctx: AppContext, input: { taskId: number; body: string }): Comment {
  const body = requireName(input.body, 'Comentário')
  const id = ctx.db.prepare('INSERT INTO comments(task_id, body) VALUES (?, ?)').run(input.taskId, body).lastInsertRowid as number
  logActivity(ctx.db, { entityType: 'task', entityId: input.taskId, taskId: input.taskId, action: 'commented', newValue: body.slice(0, 140) })
  return getComment(ctx, id)
}

export function updateComment(ctx: AppContext, id: number, patch: { body: string }): Comment {
  getComment(ctx, id)
  ctx.db.prepare(`UPDATE comments SET body = ?, updated_at = ${TS} WHERE id = ?`).run(requireName(patch.body, 'Comentário'), id)
  return getComment(ctx, id)
}

export function deleteComment(ctx: AppContext, id: number): void {
  getComment(ctx, id)
  ctx.db.prepare('DELETE FROM comments WHERE id = ?').run(id)
}
