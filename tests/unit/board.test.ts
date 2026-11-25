import { createProject } from '@main/services/projects'
import { createBoard, getBoard } from '@main/services/boards'
import { createColumn, updateColumn, moveColumn, deleteColumn } from '@main/services/columns'
import { createTask, moveTask, setTaskStatus } from '@main/services/tasks'
import { isOverdue, dueEnd } from '@shared/dates'
import { createTestCtx } from '../helpers/ctx'

let T: ReturnType<typeof createTestCtx>
beforeEach(() => { T = createTestCtx() })
afterEach(() => T.cleanup())

function setup() {
  const p = createProject(T.ctx, { companyId: 1, folderId: null, name: 'P', color: '#000' })
  const boardId = (T.ctx.db.prepare('SELECT id FROM boards WHERE project_id = ?').get(p.id) as { id: number }).id
  const cols = getBoard(T.ctx, boardId, {}).columns
  return { p, boardId, cols }
}
const ids = (boardId: number, columnId: number) =>
  getBoard(T.ctx, boardId, {}).cards.filter((c) => c.columnId === columnId).map((c) => c.title)

test('mover para coluna done seta completed_at e sair limpa', () => {
  const { boardId, cols } = setup()
  const t = createTask(T.ctx, { columnId: cols[0].id, title: 'A' })
  expect(moveTask(T.ctx, { id: t.id, columnId: cols[4].id, beforeId: null, afterId: null }).completedAt).not.toBeNull()
  expect(moveTask(T.ctx, { id: t.id, columnId: cols[1].id, beforeId: null, afterId: null }).completedAt).toBeNull()
  const log = T.ctx.db.prepare("SELECT action, old_value, new_value FROM activity_log WHERE task_id = ? AND action = 'moved'").all(t.id)
  expect(log[0]).toEqual({ action: 'moved', old_value: 'Backlog', new_value: 'Concluído' })
  void boardId
})

test('mudar categoria de coluna reavalia cards', () => {
  const { cols } = setup()
  const t = createTask(T.ctx, { columnId: cols[0].id, title: 'A' })
  updateColumn(T.ctx, cols[0].id, { category: 'done' })
  expect(T.ctx.db.prepare('SELECT completed_at FROM tasks WHERE id = ?').get(t.id)).not.toEqual({ completed_at: null })
  updateColumn(T.ctx, cols[0].id, { category: 'todo', name: 'Novo nome' })
  expect(T.ctx.db.prepare('SELECT completed_at FROM tasks WHERE id = ?').get(t.id)).toEqual({ completed_at: null })
})

test('mover entre quadros atualiza board_id; coluna destino define quadro', () => {
  const { p, cols } = setup()
  const b2 = createBoard(T.ctx, { projectId: p.id, name: 'B2' })
  const cols2 = getBoard(T.ctx, b2.id, {}).columns
  const t = createTask(T.ctx, { columnId: cols[0].id, title: 'A' })
  expect(moveTask(T.ctx, { id: t.id, columnId: cols2[2].id, beforeId: null, afterId: null }).boardId).toBe(b2.id)
})

test('ordem preservada após vários moves', () => {
  const { boardId, cols } = setup()
  const a = createTask(T.ctx, { columnId: cols[0].id, title: 'A' })
  const b = createTask(T.ctx, { columnId: cols[0].id, title: 'B' })
  const c = createTask(T.ctx, { columnId: cols[0].id, title: 'C' })
  expect(ids(boardId, cols[0].id)).toEqual(['A', 'B', 'C'])
  moveTask(T.ctx, { id: c.id, columnId: cols[0].id, beforeId: null, afterId: a.id })
  expect(ids(boardId, cols[0].id)).toEqual(['C', 'A', 'B'])
  moveTask(T.ctx, { id: a.id, columnId: cols[1].id, beforeId: null, afterId: null })
  moveTask(T.ctx, { id: b.id, columnId: cols[1].id, beforeId: null, afterId: a.id })
  expect(ids(boardId, cols[1].id)).toEqual(['B', 'A'])
  const d = createTask(T.ctx, { columnId: cols[1].id, title: 'D', afterId: b.id })
  void d
  expect(ids(boardId, cols[1].id)).toEqual(['B', 'D', 'A'])
})

test('colunas: criar após, mover, excluir com destino e sem destino', () => {
  const { boardId, cols } = setup()
  const x = createColumn(T.ctx, { boardId, name: 'X', category: 'todo', afterId: cols[0].id })
  expect(getBoard(T.ctx, boardId, {}).columns.map((c) => c.name)).toEqual(['Backlog', 'X', 'A fazer', 'Em andamento', 'Em revisão', 'Concluído'])
  moveColumn(T.ctx, { id: x.id, beforeId: cols[4].id, afterId: null })
  expect(getBoard(T.ctx, boardId, {}).columns.map((c) => c.name).at(-1)).toBe('X')
  createTask(T.ctx, { columnId: x.id, title: 'T1' })
  createTask(T.ctx, { columnId: cols[1].id, title: 'T2' })
  deleteColumn(T.ctx, { id: x.id, moveTasksTo: cols[1].id })
  expect(ids(boardId, cols[1].id)).toEqual(['T2', 'T1'])
  deleteColumn(T.ctx, { id: cols[1].id, moveTasksTo: null })
  expect(getBoard(T.ctx, boardId, {}).cards).toHaveLength(0)
})

test('excluir coluna com destino em outro quadro → VALIDATION', () => {
  const { p, cols } = setup()
  const b2 = createBoard(T.ctx, { projectId: p.id, name: 'B2' })
  const c2 = getBoard(T.ctx, b2.id, {}).columns[0]
  expect(() => deleteColumn(T.ctx, { id: cols[0].id, moveTasksTo: c2.id })).toThrow(expect.objectContaining({ code: 'VALIDATION' }))
})

test('setTaskStatus move para primeira coluna da categoria; sem coluna → CONFLICT', () => {
  const { boardId, cols } = setup()
  const t = createTask(T.ctx, { columnId: cols[0].id, title: 'A' })
  expect(setTaskStatus(T.ctx, t.id, 'in_progress').columnId).toBe(cols[2].id)
  expect(setTaskStatus(T.ctx, t.id, 'done').columnId).toBe(cols[4].id)
  deleteColumn(T.ctx, { id: cols[4].id, moveTasksTo: cols[0].id })
  expect(() => setTaskStatus(T.ctx, t.id, 'done')).toThrow(expect.objectContaining({ code: 'CONFLICT' }))
  void boardId
})

test('getBoard retorna contagens e isOverdue', () => {
  const { boardId, cols } = setup()
  const t = createTask(T.ctx, { columnId: cols[0].id, title: 'A', dueAt: '2026-11-20' })
  const cl = T.ctx.db.prepare("INSERT INTO checklists(task_id, title) VALUES (?, 'c')").run(t.id).lastInsertRowid
  T.ctx.db.prepare("INSERT INTO checklist_items(checklist_id, text, done) VALUES (?, 'a', 1), (?, 'b', 0)").run(cl, cl)
  T.ctx.db.prepare("INSERT INTO comments(task_id, body) VALUES (?, 'oi')").run(t.id)
  const card = getBoard(T.ctx, boardId, {}).cards[0]
  expect(card).toMatchObject({ checklistDone: 1, checklistTotal: 2, commentCount: 1, attachmentCount: 0, isOverdue: true, status: 'todo', labels: [] })
})

test('isOverdue com data sem hora', () => {
  expect(dueEnd('2026-11-25')).toBe('2026-11-25T23:59')
  expect(isOverdue('2026-11-25', 'todo', new Date(2026, 10, 25, 18, 0))).toBe(false)
  expect(isOverdue('2026-11-25', 'todo', new Date(2026, 10, 26, 0, 1))).toBe(true)
  expect(isOverdue('2026-11-25T10:00', 'todo', new Date(2026, 10, 25, 10, 1))).toBe(true)
  expect(isOverdue('2026-11-01', 'done', new Date(2026, 10, 26))).toBe(false)
  expect(isOverdue(null, 'todo', new Date())).toBe(false)
})
