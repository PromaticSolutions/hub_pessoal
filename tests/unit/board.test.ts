import { createProject } from '@server/services/projects'
import { createBoard, getBoard } from '@server/services/boards'
import { createColumn, updateColumn, moveColumn, deleteColumn } from '@server/services/columns'
import { createTask, moveTask, setTaskStatus } from '@server/services/tasks'
import { isOverdue, dueEnd } from '@shared/dates'
import { createTestCtx } from '../helpers/ctx'

let T: Awaited<ReturnType<typeof createTestCtx>>
beforeEach(async () => { T = await createTestCtx() })
afterEach(() => T.cleanup())

async function setup() {
  const p = await createProject(T.ctx, { companyId: 1, folderId: null, name: 'P', color: '#000' })
  const boardId = ((await T.ctx.db.one('SELECT id FROM boards WHERE project_id = ?', [p.id])) as { id: number }).id
  const cols = (await getBoard(T.ctx, boardId, {})).columns
  return { p, boardId, cols }
}
const ids = async (boardId: number, columnId: number) =>
  (await getBoard(T.ctx, boardId, {})).cards.filter((c) => c.columnId === columnId).map((c) => c.title)

test('mover para coluna done seta completed_at e sair limpa', async () => {
  const { boardId, cols } = await setup()
  const t = await createTask(T.ctx, { columnId: cols[0].id, title: 'A' })
  expect((await moveTask(T.ctx, { id: t.id, columnId: cols[4].id, beforeId: null, afterId: null })).completedAt).not.toBeNull()
  expect((await moveTask(T.ctx, { id: t.id, columnId: cols[1].id, beforeId: null, afterId: null })).completedAt).toBeNull()
  const log = (await T.ctx.db.many("SELECT action, old_value, new_value FROM activity_log WHERE task_id = ? AND action = 'moved'", [t.id]))
  expect(log[0]).toEqual({ action: 'moved', old_value: 'Backlog', new_value: 'Concluído' })
  void boardId
})

test('mudar categoria de coluna reavalia cards', async () => {
  const { cols } = await setup()
  const t = await createTask(T.ctx, { columnId: cols[0].id, title: 'A' })
  await updateColumn(T.ctx, cols[0].id, { category: 'done' })
  expect((await T.ctx.db.one('SELECT completed_at FROM tasks WHERE id = ?', [t.id]))).not.toEqual({ completed_at: null })
  await updateColumn(T.ctx, cols[0].id, { category: 'todo', name: 'Novo nome' })
  expect((await T.ctx.db.one('SELECT completed_at FROM tasks WHERE id = ?', [t.id]))).toEqual({ completed_at: null })
})

test('mover entre quadros atualiza board_id; coluna destino define quadro', async () => {
  const { p, cols } = await setup()
  const b2 = await createBoard(T.ctx, { projectId: p.id, name: 'B2' })
  const cols2 = (await getBoard(T.ctx, b2.id, {})).columns
  const t = await createTask(T.ctx, { columnId: cols[0].id, title: 'A' })
  expect((await moveTask(T.ctx, { id: t.id, columnId: cols2[2].id, beforeId: null, afterId: null })).boardId).toBe(b2.id)
})

test('ordem preservada após vários moves', async () => {
  const { boardId, cols } = await setup()
  const a = await createTask(T.ctx, { columnId: cols[0].id, title: 'A' })
  const b = await createTask(T.ctx, { columnId: cols[0].id, title: 'B' })
  const c = await createTask(T.ctx, { columnId: cols[0].id, title: 'C' })
  expect(await ids(boardId, cols[0].id)).toEqual(['A', 'B', 'C'])
  await moveTask(T.ctx, { id: c.id, columnId: cols[0].id, beforeId: null, afterId: a.id })
  expect(await ids(boardId, cols[0].id)).toEqual(['C', 'A', 'B'])
  await moveTask(T.ctx, { id: a.id, columnId: cols[1].id, beforeId: null, afterId: null })
  await moveTask(T.ctx, { id: b.id, columnId: cols[1].id, beforeId: null, afterId: a.id })
  expect(await ids(boardId, cols[1].id)).toEqual(['B', 'A'])
  const d = await createTask(T.ctx, { columnId: cols[1].id, title: 'D', afterId: b.id })
  void d
  expect(await ids(boardId, cols[1].id)).toEqual(['B', 'D', 'A'])
})

test('colunas: criar após, mover, excluir com destino e sem destino', async () => {
  const { boardId, cols } = await setup()
  const x = await createColumn(T.ctx, { boardId, name: 'X', category: 'todo', afterId: cols[0].id })
  expect((await getBoard(T.ctx, boardId, {})).columns.map((c) => c.name)).toEqual(['Backlog', 'X', 'A fazer', 'Em andamento', 'Em revisão', 'Concluído'])
  await moveColumn(T.ctx, { id: x.id, beforeId: cols[4].id, afterId: null })
  expect((await getBoard(T.ctx, boardId, {})).columns.map((c) => c.name).at(-1)).toBe('X')
  await createTask(T.ctx, { columnId: x.id, title: 'T1' })
  await createTask(T.ctx, { columnId: cols[1].id, title: 'T2' })
  await deleteColumn(T.ctx, { id: x.id, moveTasksTo: cols[1].id })
  expect(await ids(boardId, cols[1].id)).toEqual(['T2', 'T1'])
  await deleteColumn(T.ctx, { id: cols[1].id, moveTasksTo: null })
  expect((await getBoard(T.ctx, boardId, {})).cards).toHaveLength(0)
})

test('excluir coluna com destino em outro quadro → VALIDATION', async () => {
  const { p, cols } = await setup()
  const b2 = await createBoard(T.ctx, { projectId: p.id, name: 'B2' })
  const c2 = (await getBoard(T.ctx, b2.id, {})).columns[0]
  await expect(deleteColumn(T.ctx, { id: cols[0].id, moveTasksTo: c2.id })).rejects.toMatchObject({ code: 'VALIDATION' })
})

test('setTaskStatus move para primeira coluna da categoria; sem coluna → CONFLICT', async () => {
  const { boardId, cols } = await setup()
  const t = await createTask(T.ctx, { columnId: cols[0].id, title: 'A' })
  expect((await setTaskStatus(T.ctx, t.id, 'in_progress')).columnId).toBe(cols[2].id)
  expect((await setTaskStatus(T.ctx, t.id, 'done')).columnId).toBe(cols[4].id)
  await deleteColumn(T.ctx, { id: cols[4].id, moveTasksTo: cols[0].id })
  await expect(setTaskStatus(T.ctx, t.id, 'done')).rejects.toMatchObject({ code: 'CONFLICT' })
  void boardId
})

test('getBoard retorna contagens e isOverdue', async () => {
  const { boardId, cols } = await setup()
  const t = await createTask(T.ctx, { columnId: cols[0].id, title: 'A', dueAt: '2026-11-20' })
  const cl = (await T.ctx.db.one<{ id: number }>("INSERT INTO checklists(task_id, title) VALUES (?, 'c') RETURNING id", [t.id]))!.id
  await T.ctx.db.run("INSERT INTO checklist_items(checklist_id, text, done) VALUES (?, 'a', 1), (?, 'b', 0)", [cl, cl])
  await T.ctx.db.run("INSERT INTO comments(task_id, body) VALUES (?, 'oi')", [t.id])
  const card = (await getBoard(T.ctx, boardId, {})).cards[0]
  expect(card).toMatchObject({ checklistDone: 1, checklistTotal: 2, commentCount: 1, attachmentCount: 0, isOverdue: true, status: 'todo', labels: [] })
})

test('isOverdue com data sem hora', async () => {
  expect(dueEnd('2026-11-25')).toBe('2026-11-25T23:59')
  expect(isOverdue('2026-11-25', 'todo', new Date(2026, 10, 25, 18, 0))).toBe(false)
  expect(isOverdue('2026-11-25', 'todo', new Date(2026, 10, 26, 0, 1))).toBe(true)
  expect(isOverdue('2026-11-25T10:00', 'todo', new Date(2026, 10, 25, 10, 1))).toBe(true)
  expect(isOverdue('2026-11-01', 'done', new Date(2026, 10, 26))).toBe(false)
  expect(isOverdue(null, 'todo', new Date())).toBe(false)
})
