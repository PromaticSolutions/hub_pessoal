import type { BulkAction } from '@shared/types'
import type { AppContext } from '../context'
import { AppError } from '../lib/errors'
import { getTaskRow, setTaskStatus, updateTask, moveTask, archiveTask, restoreTask } from './tasks'
import { getColumn } from './columns'
import { createBoard } from './boards'
import { collectAttachmentPaths, moveToDeleted } from './attachments'

function moveTarget(ctx: AppContext, projectId: number): number {
  if (!ctx.db.prepare('SELECT 1 FROM projects WHERE id = ?').get(projectId)) throw new AppError('NOT_FOUND', 'Projeto de destino não encontrado.')
  const b = ctx.db.prepare('SELECT id FROM boards WHERE project_id = ? AND archived_at IS NULL ORDER BY position, id LIMIT 1').get(projectId) as { id: number } | undefined
  return b?.id ?? createBoard(ctx, { projectId, name: 'Quadro principal' }).id
}

/** Applies one action to many tasks in a single transaction (all or nothing; "skipped" = not applicable, not an error). */
export function bulkUpdate(ctx: AppContext, input: { ids: number[]; action: BulkAction }): { updated: number; skipped: number } {
  const ids = [...new Set(input.ids)]
  const a = input.action
  let updated = 0
  let skipped = 0
  let files: string[] = []
  ctx.db.transaction(() => {
    const boardId = a.kind === 'move' ? moveTarget(ctx, a.projectId) : null
    for (const id of ids) {
      const t = getTaskRow(ctx, id)
      switch (a.kind) {
        case 'status':
          try {
            setTaskStatus(ctx, id, a.status)
            updated++
          } catch (e) {
            if (e instanceof AppError && e.code === 'CONFLICT') skipped++
            else throw e
          }
          break
        case 'priority':
          updateTask(ctx, id, { priority: a.priority })
          updated++
          break
        case 'due':
          updateTask(ctx, id, { dueAt: a.dueAt })
          updated++
          break
        case 'move': {
          if (t.boardId === boardId) { skipped++; break }
          const category = getColumn(ctx, t.columnId).category
          const col = (ctx.db.prepare('SELECT id FROM columns WHERE board_id = ? AND category = ? ORDER BY position LIMIT 1').get(boardId, category) ??
            ctx.db.prepare('SELECT id FROM columns WHERE board_id = ? ORDER BY position LIMIT 1').get(boardId)) as { id: number } | undefined
          if (!col) throw new AppError('CONFLICT', 'O quadro de destino não tem colunas.')
          const last = ctx.db.prepare('SELECT id FROM tasks WHERE column_id = ? ORDER BY position DESC LIMIT 1').get(col.id) as { id: number } | undefined
          moveTask(ctx, { id, columnId: col.id, beforeId: last?.id ?? null, afterId: null })
          updated++
          break
        }
        case 'archive':
          if (t.archivedAt) skipped++
          else { archiveTask(ctx, id); updated++ }
          break
        case 'restore':
          if (!t.archivedAt) skipped++
          else { restoreTask(ctx, id); updated++ }
          break
        case 'delete':
          files.push(...collectAttachmentPaths(ctx.db, 'a.task_id = ?', [id]))
          ctx.db.prepare('DELETE FROM tasks WHERE id = ?').run(id)
          updated++
          break
      }
    }
  })()
  for (const f of files) moveToDeleted(ctx.paths, f)
  files = []
  return { updated, skipped }
}
