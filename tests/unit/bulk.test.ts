import { createProject } from '@server/services/projects'
import { createBoard, getBoard } from '@server/services/boards'
import { createTask, getTaskRow, setTaskStatus, archiveTask } from '@server/services/tasks'
import { deleteColumn } from '@server/services/columns'
import { bulkUpdate } from '@server/services/bulk'
import { queryTasks } from '@server/services/taskQuery'
import { addAttachments } from '@server/services/attachments'
import { createTestCtx, tempUpload } from '../helpers/ctx'

let T: Awaited<ReturnType<typeof createTestCtx>>
beforeEach(async () => { T = await createTestCtx(new Date(2026, 10, 25, 12)) })
afterEach(() => T.cleanup())

async function proj(name: string) {
  const p = await createProject(T.ctx, { companyId: 1, folderId: null, name, color: '#000' })
  const boardId = ((await T.ctx.db.one('SELECT id FROM boards WHERE project_id = ?', [p.id])) as { id: number }).id
  return { p, boardId, cols: (await getBoard(T.ctx, boardId, {})).columns }
}
const count = async () => ((await T.ctx.db.one('SELECT count(*) n FROM tasks', [])) as { n: number }).n

test('status em massa pula tarefa cujo quadro não tem a categoria', async () => {
  const a = await proj('A')
  const b = await proj('B')
  const t1 = await createTask(T.ctx, { columnId: a.cols[0].id, title: '1' })
  const t2 = await createTask(T.ctx, { columnId: b.cols[0].id, title: '2' })
  await deleteColumn(T.ctx, { id: b.cols[4].id, moveTasksTo: null })
  expect(await bulkUpdate(T.ctx, { ids: [t1.id, t2.id], action: { kind: 'status', status: 'done' } })).toEqual({ updated: 1, skipped: 1 })
  expect((await getTaskRow(T.ctx, t1.id)).completedAt).not.toBeNull()
})

test('prioridade e vencimento (definir e limpar)', async () => {
  const a = await proj('A')
  const ids: number[] = []
  for (const i of [1, 2, 3]) ids.push((await createTask(T.ctx, { columnId: a.cols[0].id, title: `t${i}` })).id)
  await bulkUpdate(T.ctx, { ids, action: { kind: 'priority', priority: 'urgent' } })
  await bulkUpdate(T.ctx, { ids, action: { kind: 'due', dueAt: '2026-12-01' } })
  expect(await Promise.all(ids.map((id) => getTaskRow(T.ctx, id)))).toEqual(expect.arrayContaining([expect.objectContaining({ priority: 'urgent', dueAt: '2026-12-01' })]))
  await bulkUpdate(T.ctx, { ids: [ids[0]], action: { kind: 'due', dueAt: null } })
  expect((await getTaskRow(T.ctx, ids[0])).dueAt).toBeNull()
  const hist = (await T.ctx.db.one("SELECT count(*) n FROM activity_log WHERE action = 'updated' AND field = 'priority'", [])) as { n: number }
  expect(hist.n).toBe(3)
})

test('mover para outro projeto mantém categoria; sem categoria vai para a primeira coluna', async () => {
  const a = await proj('A')
  const b = await proj('B')
  const dest = await proj('Destino')
  const t1 = await createTask(T.ctx, { columnId: a.cols[2].id, title: 'andamento' })
  const t2 = await createTask(T.ctx, { columnId: b.cols[4].id, title: 'feito' })
  await deleteColumn(T.ctx, { id: dest.cols[4].id, moveTasksTo: null })
  await bulkUpdate(T.ctx, { ids: [t1.id, t2.id], action: { kind: 'move', projectId: dest.p.id } })
  expect(await getTaskRow(T.ctx, t1.id)).toMatchObject({ boardId: dest.boardId, columnId: dest.cols[2].id })
  expect(await getTaskRow(T.ctx, t2.id)).toMatchObject({ boardId: dest.boardId, columnId: dest.cols[0].id })
  expect(await count()).toBe(2)
})

test('mover usa o primeiro quadro não arquivado do destino', async () => {
  const a = await proj('A')
  const dest = await proj('Destino')
  await T.ctx.db.run("UPDATE boards SET archived_at = '2026-01-01' WHERE id = ?", [dest.boardId])
  const nb = await createBoard(T.ctx, { projectId: dest.p.id, name: 'Novo' })
  const t = await createTask(T.ctx, { columnId: a.cols[0].id, title: 'x' })
  await bulkUpdate(T.ctx, { ids: [t.id], action: { kind: 'move', projectId: dest.p.id } })
  expect((await getTaskRow(T.ctx, t.id)).boardId).toBe(nb.id)
})

test('arquivar, restaurar e excluir (anexos vão para attachments-deleted)', async () => {
  const a = await proj('A')
  const ids: number[] = []
  for (const i of [1, 2]) ids.push((await createTask(T.ctx, { columnId: a.cols[0].id, title: `t${i}` })).id)
  const [att] = await addAttachments(T.ctx, { taskId: ids[0], uploads: [await tempUpload(T.ctx.storage, 'a.txt', 'x')] })
  await bulkUpdate(T.ctx, { ids, action: { kind: 'archive' } })
  expect(await queryTasks(T.ctx, { filter: {}, sort: 'due' })).toHaveLength(0)
  await bulkUpdate(T.ctx, { ids, action: { kind: 'restore' } })
  expect(await queryTasks(T.ctx, { filter: {}, sort: 'due' })).toHaveLength(2)
  expect(await bulkUpdate(T.ctx, { ids, action: { kind: 'delete' } })).toEqual({ updated: 2, skipped: 0 })
  expect(await count()).toBe(0)
  expect(await T.ctx.storage.exists(`deleted/2026-11-25/${att.storedPath}`)).toBe(true)
})

test('falha no meio não altera nada (tudo ou nada)', async () => {
  const a = await proj('A')
  const t = await createTask(T.ctx, { columnId: a.cols[0].id, title: 'x', priority: 'low' })
  await expect(bulkUpdate(T.ctx, { ids: [t.id, 99999], action: { kind: 'priority', priority: 'high' } })).rejects.toMatchObject({ code: 'NOT_FOUND' })
  expect((await getTaskRow(T.ctx, t.id)).priority).toBe('low')
  await expect(bulkUpdate(T.ctx, { ids: [t.id], action: { kind: 'move', projectId: 99999 } })).rejects.toMatchObject({ code: 'NOT_FOUND' })
  expect((await getTaskRow(T.ctx, t.id)).boardId).toBe(a.boardId)
})

test('ordenação por status e filtro por período de criação', async () => {
  const a = await proj('A')
  const t1 = await createTask(T.ctx, { columnId: a.cols[0].id, title: 'feito' })
  await setTaskStatus(T.ctx, t1.id, 'done')
  await createTask(T.ctx, { columnId: a.cols[2].id, title: 'andamento' })
  T.setNow(new Date(2026, 10, 20, 12))
  await createTask(T.ctx, { columnId: a.cols[0].id, title: 'afazer antigo' })
  T.setNow(new Date(2026, 10, 25, 12))
  const archived = await createTask(T.ctx, { columnId: a.cols[0].id, title: 'arq' })
  await archiveTask(T.ctx, archived.id)
  expect((await queryTasks(T.ctx, { filter: {}, sort: 'status' })).map((t) => t.title)).toEqual(['afazer antigo', 'andamento', 'feito'])
  expect((await queryTasks(T.ctx, { filter: { createdFrom: '2026-11-25' }, sort: 'status' })).map((t) => t.title)).toEqual(['andamento', 'feito'])
  expect((await queryTasks(T.ctx, { filter: { createdTo: '2026-11-21' }, sort: 'status' })).map((t) => t.title)).toEqual(['afazer antigo'])
})
