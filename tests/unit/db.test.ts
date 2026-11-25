import { existsSync, mkdtempSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { createTestDb } from '../helpers/db'
import { openDatabase } from '@main/db/connection'
import { runMigrations, LATEST_SCHEMA_VERSION } from '@main/db/migrate'
import { migrations } from '@main/db/migrations'
import { vacuumInto } from '@main/db/sqlutil'

let t: ReturnType<typeof createTestDb>
beforeEach(() => { t = createTestDb() })
afterEach(() => t.cleanup())

function seedTree(db: Database.Database) {
  const co = db.prepare("INSERT INTO companies(name, color) VALUES ('Empresa A', '#f00')").run().lastInsertRowid as number
  const p = db.prepare("INSERT INTO projects(company_id, name, color) VALUES (?, 'CRM', '#0f0')").run(co).lastInsertRowid as number
  const b = db.prepare("INSERT INTO boards(project_id, name) VALUES (?, 'Quadro')").run(p).lastInsertRowid as number
  const c = db.prepare("INSERT INTO columns(board_id, name, category, position) VALUES (?, 'Feito', 'done', 1)").run(b).lastInsertRowid as number
  const task = db.prepare("INSERT INTO tasks(board_id, column_id, title, description, position, due_at) VALUES (?, ?, 'Orçamento', 'desc', 1, '2026-11-25')").run(b, c).lastInsertRowid as number
  return { co, p, b, c, task }
}

test('pragmas aplicados', () => {
  expect(t.db.pragma('journal_mode', { simple: true })).toBe('wal')
  expect(t.db.pragma('foreign_keys', { simple: true })).toBe(1)
  expect(t.db.pragma('synchronous', { simple: true })).toBe(2)
})

test('migração inicial cria Pessoal único e user_version = LATEST', () => {
  const rows = t.db.prepare('SELECT name FROM companies WHERE is_personal = 1').all() as { name: string }[]
  expect(rows).toEqual([{ name: 'Pessoal' }])
  expect(t.db.pragma('user_version', { simple: true })).toBe(LATEST_SCHEMA_VERSION)
  expect(() => t.db.prepare("INSERT INTO companies(name, color, is_personal) VALUES ('X', '#000', 1)").run()).toThrow()
})

test('runMigrations é idempotente', () => {
  expect(runMigrations(t.db, {})).toEqual({ from: LATEST_SCHEMA_VERSION, to: LATEST_SCHEMA_VERSION })
})

test('cria backup pré-migração ao atualizar schema existente', () => {
  const extra = [...migrations, { version: migrations.length + 1, name: 'test', sql: 'CREATE TABLE zz(x)' }]
  const res = runMigrations(t.db, { preMigrationDir: t.paths.backupsPreMigration, migrations: extra })
  expect(res).toEqual({ from: LATEST_SCHEMA_VERSION, to: LATEST_SCHEMA_VERSION + 1 })
  const files = readdirSync(t.paths.backupsPreMigration)
  expect(files.some((f) => f.startsWith(`hub-v${LATEST_SCHEMA_VERSION}-`))).toBe(true)
})

test('schema mais novo que o app é recusado', () => {
  t.db.pragma(`user_version = ${LATEST_SCHEMA_VERSION + 1}`)
  expect(() => runMigrations(t.db, {})).toThrow(expect.objectContaining({ code: 'SCHEMA_TOO_NEW' }))
})

test('cascade de empresa apaga tudo e remove do search_index', () => {
  const s = seedTree(t.db)
  const hit = () => (t.db.prepare("SELECT count(*) n FROM search_index WHERE search_index MATCH 'orcamento'").get() as { n: number }).n
  expect(hit()).toBe(1)
  t.db.prepare('DELETE FROM companies WHERE id = ?').run(s.co)
  for (const tbl of ['projects', 'boards', 'columns', 'tasks']) {
    expect((t.db.prepare(`SELECT count(*) n FROM ${tbl}`).get() as { n: number }).n).toBe(0)
  }
  expect(hit()).toBe(0)
})

test('v_tasks calcula status, due_end e effective_archived herdado do projeto', () => {
  const s = seedTree(t.db)
  let row = t.db.prepare('SELECT status, due_end, effective_archived, company_id, project_id FROM v_tasks WHERE id = ?').get(s.task) as Record<string, unknown>
  expect(row).toEqual({ status: 'done', due_end: '2026-11-25T23:59', effective_archived: 0, company_id: s.co, project_id: s.p })
  t.db.prepare("UPDATE projects SET archived_at = '2026-01-01' WHERE id = ?").run(s.p)
  row = t.db.prepare('SELECT effective_archived FROM v_tasks WHERE id = ?').get(s.task) as Record<string, unknown>
  expect(row.effective_archived).toBe(1)
})

test("vacuumInto funciona com caminho contendo espaço e aspas simples", () => {
  const dir = join(mkdtempSync(join(tmpdir(), 'pth-q-')), "it's dir")
  const dest = join(dir, 'copy.db')
  vacuumInto(t.db, dest)
  expect(existsSync(dest)).toBe(true)
  const copy = openDatabase(dest)
  expect(copy.pragma('integrity_check', { simple: true })).toBe('ok')
  copy.close()
})
