import type { BulkAction } from '@shared/types'
import type { AppContext } from '../context'
import { withTx } from '../db/tx'
import { AppError } from '../lib/errors'
import { getTaskRow, setTaskStatus, updateTask, moveTask, archiveTask, restoreTask } from './tasks'
import { getColumn } from './columns'
import { createBoard } from './boards'
import { collectAttachmentPaths, moveToDeleted } from './attachments'

async function moveTarget(ctx: AppContext, projectId: number): Promise<number> {
  if (!(await ctx.db.one('SELECT 1 FROM projects WHERE id = ?', [projectId]))) throw new AppError('NOT_FOUND', 'Projeto de destino não encontrado.')
  const b = await ctx.db.one<{ id: number }>('SELECT id FROM boards WHERE project_id = ? AND archived_at IS NULL ORDER BY position, id LIMIT 1', [projectId])
  return b?.id ?? (await createBoard(ctx, { projectId, name: 'Quadro principal' })).id
}

/** Applies one action to many tasks in a single transaction (all or nothing; "skipped" = not applicable, not an error). */
export async function bulkUpdate(ctx: AppContext, input: { ids: number[]; action: BulkAction }): Promise<{ updated: number; skipped: number }> {
  const ids = [...new Set(input.ids)]
  const a = input.action
  let updated = 0
  let skipped = 0
  const files: string[] = []
  await withTx(ctx, async (tx) => {
    const boardId = a.kind === 'move' ? await moveTarget(tx, a.projectId) : null
    for (const id of ids) {
      const t = await getTaskRow(tx, id)
      switch (a.kind) {
        case 'status':
          try {
            await setTaskStatus(tx, id, a.status)
            updated++
          } catch (e) {
            if (e instanceof AppError && e.code === 'CONFLICT') skipped++
            else throw e
          }
          break
        case 'priority':
          await updateTask(tx, id, { priority: a.priority })
          updated++
          break
        case 'due':
          await updateTask(tx, id, { dueAt: a.dueAt })
          updated++
          break
        case 'move': {
          if (t.boardId === boardId) { skipped++; break }
          const category = (await getColumn(tx, t.columnId)).category
          const col =
            (await tx.db.one<{ id: number }>('SELECT id FROM columns WHERE board_id = ? AND category = ? ORDER BY position LIMIT 1', [boardId, category])) ??
            (await tx.db.one<{ id: number }>('SELECT id FROM columns WHERE board_id = ? ORDER BY position LIMIT 1', [boardId]))
          if (!col) throw new AppError('CONFLICT', 'O quadro de destino não tem colunas.')
          const last = await tx.db.one<{ id: number }>('SELECT id FROM tasks WHERE column_id = ? ORDER BY position DESC LIMIT 1', [col.id])
          await moveTask(tx, { id, columnId: col.id, beforeId: last?.id ?? null, afterId: null })
          updated++
          break
        }
        case 'archive':
          if (t.archivedAt) skipped++
          else { await archiveTask(tx, id); updated++ }
          break
        case 'restore':
          if (!t.archivedAt) skipped++
          else { await restoreTask(tx, id); updated++ }
          break
        case 'delete':
          files.push(...(await collectAttachmentPaths(tx.db, 'a.task_id = ?', [id])))
          await tx.db.run('DELETE FROM tasks WHERE id = ?', [id])
          updated++
          break
      }
    }
  })
  for (const f of files) await moveToDeleted(ctx, f)
  return { updated, skipped }
}
