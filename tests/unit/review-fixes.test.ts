import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type Database from 'better-sqlite3'
import { vacuumInto } from '@main/db/sqlutil'
import { runDailyAutoBackup, recoverFromAutoBackups } from '@main/services/maintenance'
import { positionForInsert } from '@main/lib/position'
import { applyRestore, createDbBackup, inspectBackup } from '@main/services/backup'
import { openDatabase } from '@main/db/connection'
import { createProject } from '@main/services/projects'
import { createFolder, archiveFolder } from '@main/services/folders'
import { getBoard } from '@main/services/boards'
import { createTask } from '@main/services/tasks'
import { queryTasks } from '@main/services/taskQuery'
import { getDashboard } from '@main/services/dashboard'
import { createTestCtx } from '../helpers/ctx'

let T: ReturnType<typeof createTestCtx>
beforeEach(() => { T = createTestCtx() })
afterEach(() => T.cleanup())

test('vacuumInto não destrói o destino existente se a cópia falhar', () => {
  const dest = join(T.ctx.paths.root, 'existing.db')
  writeFileSync(dest, 'OLD')
  const failing = { exec() { throw new Error('boom') } } as unknown as Database.Database
  expect(() => vacuumInto(failing, dest)).toThrow('boom')
  expect(readFileSync(dest, 'utf8')).toBe('OLD')
  expect(existsSync(`${dest}.part`)).toBe(false)
})

test('recuperação ignora backup automático truncado e usa o mais novo íntegro', () => {
  T.ctx.db.exec("INSERT INTO companies(name, color) VALUES ('Recuperada', '#000')")
  runDailyAutoBackup(T.ctx.db, T.ctx.paths, new Date(2026, 10, 24))
  writeFileSync(join(T.ctx.paths.backupsAuto, 'hub-2026-11-25.db'), 'truncated')
  T.ctx.db.close()
  writeFileSync(T.ctx.paths.dbFile, Buffer.alloc(8192, 9))
  const db = recoverFromAutoBackups(T.ctx.paths)
  expect(db).not.toBeNull()
  expect(db!.prepare("SELECT count(*) n FROM companies WHERE name = 'Recuperada'").get()).toEqual({ n: 1 })
  db!.close()
  expect(readFileSync(T.ctx.paths.dbFile).length).toBeGreaterThan(9)
})

test('mover para o topo 1.200 vezes mantém a ordem', () => {
  const p = createProject(T.ctx, { companyId: 1, folderId: null, name: 'P', color: '#000' })
  const boardId = (T.ctx.db.prepare('SELECT id FROM boards WHERE project_id = ?').get(p.id) as { id: number }).id
  const col = getBoard(T.ctx, boardId, {}).columns[0]
  const a = createTask(T.ctx, { columnId: col.id, title: 'a' })
  const b = createTask(T.ctx, { columnId: col.id, title: 'b' })
  let top = a.id
  for (let i = 0; i < 1200; i++) {
    const mover = top === a.id ? b.id : a.id
    const pos = positionForInsert(T.ctx.db, 'tasks', 'column_id = ? AND id <> ?', [col.id, mover], null, top)
    T.ctx.db.prepare('UPDATE tasks SET position = ? WHERE id = ?').run(pos, mover)
    top = mover
  }
  const order = T.ctx.db.prepare('SELECT id, position FROM tasks WHERE column_id = ? ORDER BY position, id').all(col.id) as { id: number; position: number }[]
  expect(order[0].id).toBe(top)
  expect(order[0].position).toBeLessThan(order[1].position)
})

test('restauração que falha no meio desfaz a troca e mantém o banco atual', async () => {
  T.ctx.db.exec("INSERT INTO companies(name, color) VALUES ('Atual', '#000')")
  const file = join(T.ctx.paths.root, 'b.db')
  createDbBackup(T.ctx, file, '1')
  const { stagingDir } = await inspectBackup(T.ctx, file)
  T.ctx.db.close()
  chmodSync(stagingDir, 0o555)
  try {
    expect(() => applyRestore(T.ctx.paths, stagingDir, new Date())).toThrow()
  } finally {
    chmodSync(stagingDir, 0o755)
  }
  const db = openDatabase(T.ctx.paths.dbFile)
  expect(db.prepare("SELECT count(*) n FROM companies WHERE name = 'Atual'").get()).toEqual({ n: 1 })
  db.close()
})

test('tarefas de projeto dentro de pasta arquivada (inclusive ancestral) saem das visões ativas', () => {
  const outer = createFolder(T.ctx, { companyId: 1, parentId: null, name: 'Fora' })
  const inner = createFolder(T.ctx, { companyId: 1, parentId: outer.id, name: 'Dentro' })
  const p = createProject(T.ctx, { companyId: 1, folderId: inner.id, name: 'P', color: '#000' })
  const boardId = (T.ctx.db.prepare('SELECT id FROM boards WHERE project_id = ?').get(p.id) as { id: number }).id
  createTask(T.ctx, { columnId: getBoard(T.ctx, boardId, {}).columns[0].id, title: 'x' })
  expect(queryTasks(T.ctx, { filter: {}, sort: 'due' })).toHaveLength(1)
  archiveFolder(T.ctx, outer.id)
  expect(queryTasks(T.ctx, { filter: {}, sort: 'due' })).toHaveLength(0)
  expect(getDashboard(T.ctx, { scope: 'all' }).kpis.total).toBe(0)
  expect(queryTasks(T.ctx, { filter: { includeArchived: true }, sort: 'due' })).toHaveLength(1)
})

void mkdirSync
