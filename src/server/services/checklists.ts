import type { Checklist, ChecklistItem } from '@shared/types'
import type { AppContext } from '../context'
import { camel, camelAll, insertId, must, requireName } from '../lib/rows'
import { positionForInsert } from '../lib/position'
import { logActivity } from '../lib/activity'

async function getChecklist(ctx: AppContext, id: number): Promise<Checklist> {
  return camel<Checklist>(must(await ctx.db.one('SELECT * FROM checklists WHERE id = ?', [id]), 'Checklist'))
}
async function getItem(ctx: AppContext, id: number): Promise<ChecklistItem> {
  return camel<ChecklistItem>(must(await ctx.db.one('SELECT * FROM checklist_items WHERE id = ?', [id]), 'Item'))
}

export async function listChecklists(ctx: AppContext, taskId: number): Promise<(Checklist & { items: ChecklistItem[] })[]> {
  const lists = camelAll<Checklist>(await ctx.db.many('SELECT * FROM checklists WHERE task_id = ? ORDER BY position, id', [taskId]))
  if (!lists.length) return []
  const items = camelAll<ChecklistItem>(
    await ctx.db.many('SELECT * FROM checklist_items WHERE checklist_id = ANY(?) ORDER BY position, id', [lists.map((l) => l.id)])
  )
  return lists.map((l) => ({ ...l, items: items.filter((i) => i.checklistId === l.id) }))
}

export async function addChecklist(ctx: AppContext, input: { taskId: number; title?: string }): Promise<Checklist> {
  const pos = await positionForInsert(ctx.db, 'checklists', 'task_id = ?', [input.taskId], null, null)
  const id = await insertId(ctx.db, 'INSERT INTO checklists(task_id, title, position) VALUES (?, ?, ?)', [input.taskId, input.title?.trim() || 'Checklist', pos])
  return getChecklist(ctx, id)
}

export async function renameChecklist(ctx: AppContext, id: number, title: string): Promise<Checklist> {
  await getChecklist(ctx, id)
  await ctx.db.run('UPDATE checklists SET title = ? WHERE id = ?', [requireName(title, 'Título'), id])
  return getChecklist(ctx, id)
}

export async function deleteChecklist(ctx: AppContext, id: number): Promise<void> {
  await getChecklist(ctx, id)
  await ctx.db.run('DELETE FROM checklists WHERE id = ?', [id])
}

export async function addChecklistItem(ctx: AppContext, input: { checklistId: number; text: string }): Promise<ChecklistItem> {
  await getChecklist(ctx, input.checklistId)
  const pos = await positionForInsert(ctx.db, 'checklist_items', 'checklist_id = ?', [input.checklistId], null, null)
  const id = await insertId(ctx.db, 'INSERT INTO checklist_items(checklist_id, text, position) VALUES (?, ?, ?)', [
    input.checklistId,
    requireName(input.text, 'Texto'),
    pos
  ])
  return getItem(ctx, id)
}

export async function updateChecklistItem(ctx: AppContext, id: number, patch: { text?: string; done?: boolean }): Promise<ChecklistItem> {
  const cur = await getItem(ctx, id)
  const text = patch.text !== undefined ? requireName(patch.text, 'Texto') : cur.text
  const done = patch.done ?? cur.done
  await ctx.db.run(
    'UPDATE checklist_items SET text = ?, done = ?, completed_at = CASE WHEN ?::boolean THEN coalesce(completed_at, iso_now()) ELSE NULL END WHERE id = ?',
    [text, done ? 1 : 0, !!done, id]
  )
  if (done && !cur.done) {
    const cl = await getChecklist(ctx, cur.checklistId)
    await logActivity(ctx.db, { entityType: 'task', entityId: cl.taskId, taskId: cl.taskId, action: 'checklist_item_done', newValue: text })
  }
  return getItem(ctx, id)
}

export async function moveChecklistItem(
  ctx: AppContext,
  input: { id: number; checklistId: number; beforeId: number | null; afterId: number | null }
): Promise<ChecklistItem> {
  await getItem(ctx, input.id)
  const pos = await positionForInsert(ctx.db, 'checklist_items', 'checklist_id = ? AND id <> ?', [input.checklistId, input.id], input.beforeId, input.afterId)
  await ctx.db.run('UPDATE checklist_items SET checklist_id = ?, position = ? WHERE id = ?', [input.checklistId, pos, input.id])
  return getItem(ctx, input.id)
}

export async function deleteChecklistItem(ctx: AppContext, id: number): Promise<void> {
  await getItem(ctx, id)
  await ctx.db.run('DELETE FROM checklist_items WHERE id = ?', [id])
}
