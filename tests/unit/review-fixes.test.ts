import { positionForInsert } from '@server/lib/position'
import { createProject } from '@server/services/projects'
import { createFolder, archiveFolder } from '@server/services/folders'
import { getBoard } from '@server/services/boards'
import { createTask } from '@server/services/tasks'
import { queryTasks } from '@server/services/taskQuery'
import { getDashboard } from '@server/services/dashboard'
import { gzipSync } from 'node:zlib'
import { createBackup, restoreBackup } from '@server/services/backup'
import { exportDataset } from '@server/services/dataset'
import { createTestCtx } from '../helpers/ctx'

let T: Awaited<ReturnType<typeof createTestCtx>>
beforeEach(async () => { T = await createTestCtx() })
afterEach(() => T.cleanup())

test('backup automático truncado é recusado e os dados atuais ficam', async () => {
  await T.ctx.db.run("INSERT INTO companies(name, color) VALUES ('Atual', '#000')")
  const key = (await createBackup(T.ctx, 'auto')).key
  const bytes = await T.ctx.storage.get(key)
  await T.ctx.storage.put(key, bytes.slice(0, Math.floor(bytes.length / 2)))
  await expect(restoreBackup(T.ctx, key)).rejects.toMatchObject({ code: 'INVALID_BACKUP' })
  expect(await T.ctx.db.one("SELECT count(*) n FROM companies WHERE name = 'Atual'")).toEqual({ n: 1 })
})

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

test('restauração que falha no meio desfaz a troca e mantém o banco atual', async () => {
  await T.ctx.db.run("INSERT INTO companies(name, color) VALUES ('Atual', '#000')")
  await createProject(T.ctx, { companyId: 1, folderId: null, name: 'P', color: '#000' })
  const ds = await exportDataset(T.ctx.db, T.ctx.now())
  // a row that breaks a foreign key halfway through the import
  ds.tables.projects.push({ ...ds.tables.projects[0], id: 99, company_id: 12345, name: 'quebrado' })
  await T.ctx.storage.put('backups/manual/hub-2026-11-25_120000.json.gz', gzipSync(Buffer.from(JSON.stringify(ds))))
  await expect(restoreBackup(T.ctx, 'backups/manual/hub-2026-11-25_120000.json.gz')).rejects.toBeTruthy()
  expect(await T.ctx.db.one("SELECT count(*) n FROM companies WHERE name = 'Atual'")).toEqual({ n: 1 })
})

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

