import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { createProject } from '@main/services/projects'
import { createBoard, getBoard } from '@main/services/boards'
import { createTask, getTaskRow, setTaskStatus, archiveTask } from '@main/services/tasks'
import { deleteColumn } from '@main/services/columns'
import { addAttachments } from '@main/services/attachments'
import { bulkUpdate } from '@main/services/bulk'
import { queryTasks } from '@main/services/taskQuery'
import { createTestCtx, tempFile } from '../helpers/ctx'

let T: ReturnType<typeof createTestCtx>
beforeEach(() => { T = createTestCtx(new Date(2026, 10, 25, 12)) })
afterEach(() => T.cleanup())

function proj(name: string) {
  const p = createProject(T.ctx, { companyId: 1, folderId: null, name, color: '#000' })
  const boardId = (T.ctx.db.prepare('SELECT id FROM boards WHERE project_id = ?').get(p.id) as { id: number }).id
  return { p, boardId, cols: getBoard(T.ctx, boardId, {}).columns }
}
const count = () => (T.ctx.db.prepare('SELECT count(*) n FROM tasks').get() as { n: number }).n

test('status em massa pula tarefa cujo quadro não tem a categoria', () => {
  const a = proj('A')
  const b = proj('B')
  const t1 = createTask(T.ctx, { columnId: a.cols[0].id, title: '1' })
  const t2 = createTask(T.ctx, { columnId: b.cols[0].id, title: '2' })
  deleteColumn(T.ctx, { id: b.cols[4].id, moveTasksTo: null })
  expect(bulkUpdate(T.ctx, { ids: [t1.id, t2.id], action: { kind: 'status', status: 'done' } })).toEqual({ updated: 1, skipped: 1 })
  expect(getTaskRow(T.ctx, t1.id).completedAt).not.toBeNull()
})

test('prioridade e vencimento (definir e limpar)', () => {
  const a = proj('A')
  const ids = [1, 2, 3].map((i) => createTask(T.ctx, { columnId: a.cols[0].id, title: `t${i}` }).id)
  bulkUpdate(T.ctx, { ids, action: { kind: 'priority', priority: 'urgent' } })
  bulkUpdate(T.ctx, { ids, action: { kind: 'due', dueAt: '2026-12-01' } })
  expect(ids.map((id) => getTaskRow(T.ctx, id))).toEqual(expect.arrayContaining([expect.objectContaining({ priority: 'urgent', dueAt: '2026-12-01' })]))
  bulkUpdate(T.ctx, { ids: [ids[0]], action: { kind: 'due', dueAt: null } })
  expect(getTaskRow(T.ctx, ids[0]).dueAt).toBeNull()
  const hist = T.ctx.db.prepare("SELECT count(*) n FROM activity_log WHERE action = 'updated' AND field = 'priority'").get() as { n: number }
  expect(hist.n).toBe(3)
})

test('mover para outro projeto mantém categoria; sem categoria vai para a primeira coluna', () => {
  const a = proj('A')
  const b = proj('B')
  const dest = proj('Destino')
  const t1 = createTask(T.ctx, { columnId: a.cols[2].id, title: 'andamento' })
  const t2 = createTask(T.ctx, { columnId: b.cols[4].id, title: 'feito' })
  deleteColumn(T.ctx, { id: dest.cols[4].id, moveTasksTo: null })
  bulkUpdate(T.ctx, { ids: [t1.id, t2.id], action: { kind: 'move', projectId: dest.p.id } })
  expect(getTaskRow(T.ctx, t1.id)).toMatchObject({ boardId: dest.boardId, columnId: dest.cols[2].id })
  expect(getTaskRow(T.ctx, t2.id)).toMatchObject({ boardId: dest.boardId, columnId: dest.cols[0].id })
  expect(count()).toBe(2)
})

test('mover usa o primeiro quadro não arquivado do destino', () => {
  const a = proj('A')
  const dest = proj('Destino')
  T.ctx.db.prepare("UPDATE boards SET archived_at = '2026-01-01' WHERE id = ?").run(dest.boardId)
  const nb = createBoard(T.ctx, { projectId: dest.p.id, name: 'Novo' })
  const t = createTask(T.ctx, { columnId: a.cols[0].id, title: 'x' })
  bulkUpdate(T.ctx, { ids: [t.id], action: { kind: 'move', projectId: dest.p.id } })
  expect(getTaskRow(T.ctx, t.id).boardId).toBe(nb.id)
})

test('arquivar, restaurar e excluir (anexos vão para attachments-deleted)', () => {
  const a = proj('A')
  const ids = [1, 2].map((i) => createTask(T.ctx, { columnId: a.cols[0].id, title: `t${i}` }).id)
  const [att] = addAttachments(T.ctx, { taskId: ids[0], sourcePaths: [tempFile('a.txt', 'x')] })
  bulkUpdate(T.ctx, { ids, action: { kind: 'archive' } })
  expect(queryTasks(T.ctx, { filter: {}, sort: 'due' })).toHaveLength(0)
  bulkUpdate(T.ctx, { ids, action: { kind: 'restore' } })
  expect(queryTasks(T.ctx, { filter: {}, sort: 'due' })).toHaveLength(2)
  expect(bulkUpdate(T.ctx, { ids, action: { kind: 'delete' } })).toEqual({ updated: 2, skipped: 0 })
  expect(count()).toBe(0)
  expect(existsSync(join(T.ctx.paths.attachmentsDeleted, att.storedPath))).toBe(true)
})

test('falha no meio não altera nada (tudo ou nada)', () => {
  const a = proj('A')
  const t = createTask(T.ctx, { columnId: a.cols[0].id, title: 'x', priority: 'low' })
  expect(() => bulkUpdate(T.ctx, { ids: [t.id, 99999], action: { kind: 'priority', priority: 'high' } })).toThrow(expect.objectContaining({ code: 'NOT_FOUND' }))
  expect(getTaskRow(T.ctx, t.id).priority).toBe('low')
  expect(() => bulkUpdate(T.ctx, { ids: [t.id], action: { kind: 'move', projectId: 99999 } })).toThrow(expect.objectContaining({ code: 'NOT_FOUND' }))
  expect(getTaskRow(T.ctx, t.id).boardId).toBe(a.boardId)
})

test('ordenação por status e filtro por período de criação', () => {
  const a = proj('A')
  const t1 = createTask(T.ctx, { columnId: a.cols[0].id, title: 'feito' })
  setTaskStatus(T.ctx, t1.id, 'done')
  createTask(T.ctx, { columnId: a.cols[2].id, title: 'andamento' })
  T.setNow(new Date(2026, 10, 20, 12))
  createTask(T.ctx, { columnId: a.cols[0].id, title: 'afazer antigo' })
  T.setNow(new Date(2026, 10, 25, 12))
  const archived = createTask(T.ctx, { columnId: a.cols[0].id, title: 'arq' })
  archiveTask(T.ctx, archived.id)
  expect(queryTasks(T.ctx, { filter: {}, sort: 'status' }).map((t) => t.title)).toEqual(['afazer antigo', 'andamento', 'feito'])
  expect(queryTasks(T.ctx, { filter: { createdFrom: '2026-11-25' }, sort: 'status' }).map((t) => t.title)).toEqual(['andamento', 'feito'])
  expect(queryTasks(T.ctx, { filter: { createdTo: '2026-11-21' }, sort: 'status' }).map((t) => t.title)).toEqual(['afazer antigo'])
})
