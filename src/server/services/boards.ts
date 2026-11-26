import type { Board, CardSummary, Column, Company, Project } from '@shared/types'
import { CARD_COLS, toCards } from './cards'
import { DEFAULT_COLUMNS } from '@shared/constants'
import type { AppContext } from '../context'
import { withTx } from '../db/tx'
import { camel, camelAll, insertId, must, requireName } from '../lib/rows'
import { positionForInsert } from '../lib/position'
import { logActivity } from '../lib/activity'
import { collectAttachmentPaths, moveToDeleted } from './attachments'

export async function getBoardRow(ctx: AppContext, id: number): Promise<Board> {
  return camel<Board>(must(await ctx.db.one('SELECT * FROM boards WHERE id = ?', [id]), 'Quadro'))
}

export async function createBoard(ctx: AppContext, input: { projectId: number; name: string }): Promise<Board> {
  const name = requireName(input.name)
  return withTx(ctx, async (tx) => {
    const pos = await positionForInsert(tx.db, 'boards', 'project_id = ?', [input.projectId], null, null)
    const id = await insertId(tx.db, 'INSERT INTO boards(project_id, name, position) VALUES (?, ?, ?)', [input.projectId, name, pos])
    for (const [i, c] of DEFAULT_COLUMNS.entries()) {
      await tx.db.run('INSERT INTO columns(board_id, name, category, position) VALUES (?, ?, ?, ?)', [id, c.name, c.category, (i + 1) * 1024])
    }
    await logActivity(tx.db, { entityType: 'board', entityId: id, action: 'created' })
    return getBoardRow(tx, id)
  })
}

export async function listBoards(ctx: AppContext, input: { projectId: number; includeArchived?: boolean }): Promise<Board[]> {
  return camelAll<Board>(
    await ctx.db.many('SELECT * FROM boards WHERE project_id = ? AND (?::boolean OR archived_at IS NULL) ORDER BY position, id', [
      input.projectId,
      !!input.includeArchived
    ])
  )
}

export async function updateBoard(ctx: AppContext, id: number, patch: { name?: string; color?: string | null }): Promise<Board> {
  const cur = await getBoardRow(ctx, id)
  await ctx.db.run('UPDATE boards SET name = ?, color = ?, updated_at = iso_now() WHERE id = ?', [
    patch.name !== undefined ? requireName(patch.name) : cur.name,
    patch.color !== undefined ? patch.color : cur.color,
    id
  ])
  return getBoardRow(ctx, id)
}

export async function reorderBoard(ctx: AppContext, id: number, w: { beforeId: number | null; afterId: number | null }): Promise<void> {
  const b = await getBoardRow(ctx, id)
  const pos = await positionForInsert(ctx.db, 'boards', 'project_id = ?', [b.projectId], w.beforeId, w.afterId)
  await ctx.db.run('UPDATE boards SET position = ? WHERE id = ?', [pos, id])
}

export async function archiveBoard(ctx: AppContext, id: number): Promise<Board> {
  await getBoardRow(ctx, id)
  await ctx.db.run('UPDATE boards SET archived_at = iso_now() WHERE id = ?', [id])
  await logActivity(ctx.db, { entityType: 'board', entityId: id, action: 'archived' })
  return getBoardRow(ctx, id)
}

export async function restoreBoard(ctx: AppContext, id: number): Promise<Board> {
  await getBoardRow(ctx, id)
  await ctx.db.run('UPDATE boards SET archived_at = NULL WHERE id = ?', [id])
  await logActivity(ctx.db, { entityType: 'board', entityId: id, action: 'restored' })
  return getBoardRow(ctx, id)
}

export async function deleteBoard(ctx: AppContext, id: number): Promise<void> {
  await getBoardRow(ctx, id)
  const files = await collectAttachmentPaths(ctx.db, 't.board_id = ?', [id])
  await ctx.db.run('DELETE FROM boards WHERE id = ?', [id])
  for (const f of files) await moveToDeleted(ctx, f)
}

export type BoardFull = { board: Board; project: Project; company: Company; columns: Column[]; cards: CardSummary[] }

export async function getBoard(ctx: AppContext, id: number, opts: { includeArchived?: boolean }): Promise<BoardFull> {
  const board = await getBoardRow(ctx, id)
  const project = camel<Project>((await ctx.db.one('SELECT * FROM projects WHERE id = ?', [board.projectId]))!)
  const company = camel<Company>((await ctx.db.one('SELECT * FROM companies WHERE id = ?', [project.companyId]))!)
  const columns = camelAll<Column>(await ctx.db.many('SELECT * FROM columns WHERE board_id = ? ORDER BY position, id', [id]))
  const rows = await ctx.db.many(
    `SELECT ${CARD_COLS} FROM v_tasks t WHERE t.board_id = ? AND (?::boolean OR t.archived_at IS NULL) ORDER BY t.position, t.id`,
    [id, !!opts.includeArchived]
  )
  return { board, project, company, columns, cards: await toCards(ctx, rows) }
}
