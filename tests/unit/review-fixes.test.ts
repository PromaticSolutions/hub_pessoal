import { positionForInsert } from '@server/lib/position'
import { createProject } from '@server/services/projects'
import { createFolder, archiveFolder } from '@server/services/folders'
import { getBoard } from '@server/services/boards'
import { createTask } from '@server/services/tasks'
import { queryTasks } from '@server/services/taskQuery'
import { getDashboard } from '@server/services/dashboard'
import { createTestCtx } from '../helpers/ctx'

let T: Awaited<ReturnType<typeof createTestCtx>>
beforeEach(async () => { T = await createTestCtx() })
afterEach(() => T.cleanup())

// Task 5: SQLite file backup/recovery replaced by Storage backups.
test.skip('vacuumInto não destrói o destino existente se a cópia falhar', () => {})

// Task 5: SQLite file backup/recovery replaced by Storage backups.
test.skip('recuperação ignora backup automático truncado e usa o mais novo íntegro', () => {})

test('mover para o topo 1.200 vezes mantém a ordem', async () => {
  const p = await createProject(T.ctx, { companyId: 1, folderId: null, name: 'P', color: '#000' })
  const boardId = ((await T.ctx.db.one('SELECT id FROM boards WHERE project_id = ?', [p.id])) as { id: number }).id
  const col = (await getBoard(T.ctx, boardId, {})).columns[0]
  const a = await createTask(T.ctx, { columnId: col.id, title: 'a' })
  const b = await createTask(T.ctx, { columnId: col.id, title: 'b' })
  let top = a.id
  for (let i = 0; i < 1200; i++) {
    const mover = top === a.id ? b.id : a.id
    const pos = await positionForInsert(T.ctx.db, 'tasks', 'column_id = ? AND id <> ?', [col.id, mover], null, top)
    await T.ctx.db.run('UPDATE tasks SET position = ? WHERE id = ?', [pos, mover])
    top = mover
  }
  const order = (await T.ctx.db.many('SELECT id, position FROM tasks WHERE column_id = ? ORDER BY position, id', [col.id])) as { id: number; position: number }[]
  expect(order[0].id).toBe(top)
  expect(order[0].position).toBeLessThan(order[1].position)
})

// Task 5: SQLite file backup/recovery replaced by Storage backups.
test.skip('restauração que falha no meio desfaz a troca e mantém o banco atual', () => {})

test('tarefas de projeto dentro de pasta arquivada (inclusive ancestral) saem das visões ativas', async () => {
  const outer = await createFolder(T.ctx, { companyId: 1, parentId: null, name: 'Fora' })
  const inner = await createFolder(T.ctx, { companyId: 1, parentId: outer.id, name: 'Dentro' })
  const p = await createProject(T.ctx, { companyId: 1, folderId: inner.id, name: 'P', color: '#000' })
  const boardId = ((await T.ctx.db.one('SELECT id FROM boards WHERE project_id = ?', [p.id])) as { id: number }).id
  await createTask(T.ctx, { columnId: (await getBoard(T.ctx, boardId, {})).columns[0].id, title: 'x' })
  expect(await queryTasks(T.ctx, { filter: {}, sort: 'due' })).toHaveLength(1)
  await archiveFolder(T.ctx, outer.id)
  expect(await queryTasks(T.ctx, { filter: {}, sort: 'due' })).toHaveLength(0)
  expect((await getDashboard(T.ctx, { scope: 'all' })).kpis.total).toBe(0)
  expect(await queryTasks(T.ctx, { filter: { includeArchived: true }, sort: 'due' })).toHaveLength(1)
})

