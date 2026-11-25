import type { Board } from '@shared/types'
import { DEFAULT_COLUMNS } from '@shared/constants'
import type { AppContext } from '../context'
import { camel, camelAll, must, requireName } from '../lib/rows'
import { positionForInsert } from '../lib/position'
import { logActivity } from '../lib/activity'
import { collectAttachmentPaths, moveToDeleted } from './attachments'

const TS = "strftime('%Y-%m-%dT%H:%M:%fZ','now')"

export function getBoardRow(ctx: AppContext, id: number): Board {
  return camel<Board>(must(ctx.db.prepare('SELECT * FROM boards WHERE id = ?').get(id) as Record<string, unknown>, 'Quadro'))
}

export function createBoard(ctx: AppContext, input: { projectId: number; name: string }): Board {
  const name = requireName(input.name)
  return ctx.db.transaction(() => {
    const pos = positionForInsert(ctx.db, 'boards', 'project_id = ?', [input.projectId], null, null)
    const id = ctx.db.prepare('INSERT INTO boards(project_id, name, position) VALUES (?, ?, ?)').run(input.projectId, name, pos).lastInsertRowid as number
    const ins = ctx.db.prepare('INSERT INTO columns(board_id, name, category, position) VALUES (?, ?, ?, ?)')
    DEFAULT_COLUMNS.forEach((c, i) => ins.run(id, c.name, c.category, (i + 1) * 1024))
    logActivity(ctx.db, { entityType: 'board', entityId: id, action: 'created' })
    return getBoardRow(ctx, id)
  })()
}

export function listBoards(ctx: AppContext, input: { projectId: number; includeArchived?: boolean }): Board[] {
  return camelAll<Board>(
    ctx.db
      .prepare('SELECT * FROM boards WHERE project_id = ? AND (? OR archived_at IS NULL) ORDER BY position, id')
      .all(input.projectId, input.includeArchived ? 1 : 0)
  )
}

export function updateBoard(ctx: AppContext, id: number, patch: { name: string }): Board {
  getBoardRow(ctx, id)
  ctx.db.prepare(`UPDATE boards SET name = ?, updated_at = ${TS} WHERE id = ?`).run(requireName(patch.name), id)
  return getBoardRow(ctx, id)
}

export function reorderBoard(ctx: AppContext, id: number, w: { beforeId: number | null; afterId: number | null }): void {
  const b = getBoardRow(ctx, id)
  const pos = positionForInsert(ctx.db, 'boards', 'project_id = ?', [b.projectId], w.beforeId, w.afterId)
  ctx.db.prepare('UPDATE boards SET position = ? WHERE id = ?').run(pos, id)
}

export function archiveBoard(ctx: AppContext, id: number): Board {
  getBoardRow(ctx, id)
  ctx.db.prepare(`UPDATE boards SET archived_at = ${TS} WHERE id = ?`).run(id)
  logActivity(ctx.db, { entityType: 'board', entityId: id, action: 'archived' })
  return getBoardRow(ctx, id)
}

export function restoreBoard(ctx: AppContext, id: number): Board {
  getBoardRow(ctx, id)
  ctx.db.prepare('UPDATE boards SET archived_at = NULL WHERE id = ?').run(id)
  logActivity(ctx.db, { entityType: 'board', entityId: id, action: 'restored' })
  return getBoardRow(ctx, id)
}

export function deleteBoard(ctx: AppContext, id: number): void {
  getBoardRow(ctx, id)
  const files = collectAttachmentPaths(ctx.db, 't.board_id = ?', [id])
  ctx.db.prepare('DELETE FROM boards WHERE id = ?').run(id)
  for (const f of files) moveToDeleted(ctx.paths, f)
}
