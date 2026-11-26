import type { Comment } from '@shared/types'
import type { AppContext } from '../context'
import { camel, camelAll, insertId, must, requireName } from '../lib/rows'
import { logActivity } from '../lib/activity'

async function getComment(ctx: AppContext, id: number): Promise<Comment> {
  return camel<Comment>(must(await ctx.db.one('SELECT * FROM comments WHERE id = ?', [id]), 'Comentário'))
}

export async function listComments(ctx: AppContext, taskId: number): Promise<Comment[]> {
  return camelAll<Comment>(await ctx.db.many('SELECT * FROM comments WHERE task_id = ? ORDER BY created_at, id', [taskId]))
}

export async function addComment(ctx: AppContext, input: { taskId: number; body: string }): Promise<Comment> {
  const body = requireName(input.body, 'Comentário')
  const id = await insertId(ctx.db, 'INSERT INTO comments(task_id, body) VALUES (?, ?)', [input.taskId, body])
  await logActivity(ctx.db, { entityType: 'task', entityId: input.taskId, taskId: input.taskId, action: 'commented', newValue: body.slice(0, 140) })
  return getComment(ctx, id)
}

export async function updateComment(ctx: AppContext, id: number, patch: { body: string }): Promise<Comment> {
  await getComment(ctx, id)
  await ctx.db.run('UPDATE comments SET body = ?, updated_at = iso_now() WHERE id = ?', [requireName(patch.body, 'Comentário'), id])
  return getComment(ctx, id)
}

export async function deleteComment(ctx: AppContext, id: number): Promise<void> {
  await getComment(ctx, id)
  await ctx.db.run('DELETE FROM comments WHERE id = ?', [id])
}
