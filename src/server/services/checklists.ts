import type { Checklist, ChecklistItem } from '@shared/types'
import type { AppContext } from '../context'
import { camel, camelAll, must, requireName } from '../lib/rows'
import { positionForInsert } from '../lib/position'
import { logActivity } from '../lib/activity'

const TS = "strftime('%Y-%m-%dT%H:%M:%fZ','now')"

function getChecklist(ctx: AppContext, id: number): Checklist {
  return camel<Checklist>(must(ctx.db.prepare('SELECT * FROM checklists WHERE id = ?').get(id) as Record<string, unknown>, 'Checklist'))
}
function getItem(ctx: AppContext, id: number): ChecklistItem {
  return camel<ChecklistItem>(must(ctx.db.prepare('SELECT * FROM checklist_items WHERE id = ?').get(id) as Record<string, unknown>, 'Item'))
}

export function listChecklists(ctx: AppContext, taskId: number): (Checklist & { items: ChecklistItem[] })[] {
  const lists = camelAll<Checklist>(ctx.db.prepare('SELECT * FROM checklists WHERE task_id = ? ORDER BY position, id').all(taskId))
  return lists.map((l) => ({
    ...l,
    items: camelAll<ChecklistItem>(ctx.db.prepare('SELECT * FROM checklist_items WHERE checklist_id = ? ORDER BY position, id').all(l.id))
  }))
}

export function addChecklist(ctx: AppContext, input: { taskId: number; title?: string }): Checklist {
  const pos = positionForInsert(ctx.db, 'checklists', 'task_id = ?', [input.taskId], null, null)
  const id = ctx.db.prepare('INSERT INTO checklists(task_id, title, position) VALUES (?, ?, ?)').run(input.taskId, input.title?.trim() || 'Checklist', pos)
    .lastInsertRowid as number
  return getChecklist(ctx, id)
}

export function renameChecklist(ctx: AppContext, id: number, title: string): Checklist {
  getChecklist(ctx, id)
  ctx.db.prepare('UPDATE checklists SET title = ? WHERE id = ?').run(requireName(title, 'Título'), id)
  return getChecklist(ctx, id)
}

export function deleteChecklist(ctx: AppContext, id: number): void {
  getChecklist(ctx, id)
  ctx.db.prepare('DELETE FROM checklists WHERE id = ?').run(id)
}

export function addChecklistItem(ctx: AppContext, input: { checklistId: number; text: string }): ChecklistItem {
  getChecklist(ctx, input.checklistId)
  const pos = positionForInsert(ctx.db, 'checklist_items', 'checklist_id = ?', [input.checklistId], null, null)
  const id = ctx.db.prepare('INSERT INTO checklist_items(checklist_id, text, position) VALUES (?, ?, ?)').run(input.checklistId, requireName(input.text, 'Texto'), pos)
    .lastInsertRowid as number
  return getItem(ctx, id)
}

export function updateChecklistItem(ctx: AppContext, id: number, patch: { text?: string; done?: boolean }): ChecklistItem {
  const cur = getItem(ctx, id)
  const text = patch.text !== undefined ? requireName(patch.text, 'Texto') : cur.text
  const done = patch.done ?? cur.done
  ctx.db
    .prepare(`UPDATE checklist_items SET text = ?, done = ?, completed_at = CASE WHEN ? THEN coalesce(completed_at, ${TS}) ELSE NULL END WHERE id = ?`)
    .run(text, done ? 1 : 0, done ? 1 : 0, id)
  if (done && !cur.done) {
    const cl = getChecklist(ctx, cur.checklistId)
    logActivity(ctx.db, { entityType: 'task', entityId: cl.taskId, taskId: cl.taskId, action: 'checklist_item_done', newValue: text })
  }
  return getItem(ctx, id)
}

export function moveChecklistItem(ctx: AppContext, input: { id: number; checklistId: number; beforeId: number | null; afterId: number | null }): ChecklistItem {
  getItem(ctx, input.id)
  const pos = positionForInsert(ctx.db, 'checklist_items', 'checklist_id = ? AND id <> ?', [input.checklistId, input.id], input.beforeId, input.afterId)
  ctx.db.prepare('UPDATE checklist_items SET checklist_id = ?, position = ? WHERE id = ?').run(input.checklistId, pos, input.id)
  return getItem(ctx, input.id)
}

export function deleteChecklistItem(ctx: AppContext, id: number): void {
  getItem(ctx, id)
  ctx.db.prepare('DELETE FROM checklist_items WHERE id = ?').run(id)
}
