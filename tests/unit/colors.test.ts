import { createProject } from '@server/services/projects'
import { getBoard, updateBoard } from '@server/services/boards'
import { updateColumn } from '@server/services/columns'
import { createTask, updateTask, getTask } from '@server/services/tasks'
import { tint } from '@shared/colors'
import { createTestCtx } from '../helpers/ctx'

test('schema v1: cores nulas por padrão em quadro, coluna e cartão', async () => {
  const T = await createTestCtx()
  const db = T.ctx.db
  await db.exec("INSERT INTO projects(company_id, name, color) VALUES (1, 'P', '#000')")
  await db.exec("INSERT INTO boards(project_id, name) VALUES (1, 'B')")
  await db.exec("INSERT INTO columns(board_id, name) VALUES (1, 'C')")
  await db.exec("INSERT INTO tasks(board_id, column_id, title) VALUES (1, 1, 'T')")
  expect(await db.one('SELECT b.color bc, c.color cc, t.color tc, t.title FROM tasks t JOIN boards b ON b.id = t.board_id JOIN columns c ON c.id = t.column_id')).toEqual({ bc: null, cc: null, tc: null, title: 'T' })
  await T.cleanup()
})

test('atualiza cores de quadro, coluna e cartão; cartão expõe cor no resumo', async () => {
  const T = await createTestCtx()
  const p = await createProject(T.ctx, { companyId: 1, folderId: null, name: 'P', color: '#000' })
  const boardId = ((await T.ctx.db.one('SELECT id FROM boards WHERE project_id = ?', [p.id])) as { id: number }).id
  const col = (await getBoard(T.ctx, boardId, {})).columns[0]
  expect((await updateBoard(T.ctx, boardId, { color: '#0EA5E9' })).color).toBe('#0EA5E9')
  expect(await updateBoard(T.ctx, boardId, { name: 'Renomeado' })).toMatchObject({ name: 'Renomeado', color: '#0EA5E9' })
  expect((await updateColumn(T.ctx, col.id, { color: '#F59E0B' })).color).toBe('#F59E0B')
  expect((await updateColumn(T.ctx, col.id, { color: null })).color).toBeNull()
  const t = await createTask(T.ctx, { columnId: col.id, title: 'x' })
  await updateTask(T.ctx, t.id, { color: '#EC4899' })
  expect((await getTask(T.ctx, t.id)).color).toBe('#EC4899')
  expect((await getBoard(T.ctx, boardId, {})).cards[0].color).toBe('#EC4899')
  const hist = (await T.ctx.db.one("SELECT count(*) n FROM activity_log WHERE field = 'color'", [])) as { n: number }
  expect(hist.n).toBe(0)
  await T.cleanup()
})

test('tint converte hex em rgba', async () => {
  expect(tint('#0EA5E9', 0.07)).toBe('rgba(14, 165, 233, 0.07)')
  expect(tint('#abc', 0.5)).toBe('rgba(170, 187, 204, 0.5)')
})
