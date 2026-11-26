import { createTestDb } from '../helpers/db'
import type { Db } from '@server/db/db'
import { toPg } from '@server/db/sql'
import { createPgliteDb, closePgliteDb } from '@server/db/pglite'
import { runMigrations, syncSequences, LATEST_SCHEMA_VERSION } from '@server/db/migrate'

let t: Awaited<ReturnType<typeof createTestDb>>
let db: Db
beforeEach(async () => { t = await createTestDb(); db = t.db })
afterEach(async () => { await t.cleanup() })

async function seedTree(db: Db) {
  const co = (await db.one<{ id: number }>("INSERT INTO companies(name, color) VALUES ('Empresa A', '#f00') RETURNING id"))!.id
  const p = (await db.one<{ id: number }>("INSERT INTO projects(company_id, name, color) VALUES (?, 'CRM', '#0f0') RETURNING id", [co]))!.id
  const b = (await db.one<{ id: number }>("INSERT INTO boards(project_id, name) VALUES (?, 'Quadro') RETURNING id", [p]))!.id
  const c = (await db.one<{ id: number }>("INSERT INTO columns(board_id, name, category, position) VALUES (?, 'Feito', 'done', 1) RETURNING id", [b]))!.id
  const task = (await db.one<{ id: number }>(
    "INSERT INTO tasks(board_id, column_id, title, description, position, due_at) VALUES (?, ?, 'Orçamento Ação', 'Revisão da PROPOSTA', 1, '2026-11-25') RETURNING id",
    [b, c]
  ))!.id
  return { co, p, b, c, task }
}

const V7_TABLES = [
  'activity_log', 'attachments', 'boards', 'checklist_items', 'checklists', 'columns', 'comments', 'companies',
  'dashboard_widgets', 'dashboards', 'day_blocks', 'folders', 'idea_labels', 'ideas', 'labels', 'projects',
  'search_index', 'settings', 'shopping_items', 'task_labels', 'tasks'
]

test('toPg troca ? por $n fora de literais', () => {
  expect(toPg("a = ? AND b = '?' AND c = ?")).toBe("a = $1 AND b = '?' AND c = $2")
  expect(toPg("x = 'it''s ?' OR y = ?")).toBe("x = 'it''s ?' OR y = $1")
})

test('count, sum(int) e avg voltam como number', async () => {
  await seedTree(db)
  const r = await db.one<Record<string, unknown>>('SELECT count(*) n, sum(id) s, avg(id) a, sum(position) p FROM tasks')
  expect(r).toEqual({ n: 1, s: expect.any(Number), a: expect.any(Number), p: 1 })
  for (const v of Object.values(r!)) expect(typeof v).toBe('number')
  expect((await db.one<{ m: unknown }>("SELECT 2.5::numeric m"))!.m).toBe(2.5)
})

test('one/many/run com parâmetros', async () => {
  await db.run("INSERT INTO settings(key, value) VALUES (?, ?), (?, ?)", ['a', '1', 'b', '2'])
  expect(await db.many('SELECT key, value FROM settings ORDER BY key')).toEqual([{ key: 'a', value: '1' }, { key: 'b', value: '2' }])
  expect(await db.one('SELECT value FROM settings WHERE key = ?', ['zz'])).toBeUndefined()
  expect(await db.run("UPDATE settings SET value = 'x' WHERE key IN (?, ?)", ['a', 'b'])).toEqual({ rowCount: 2 })
})

test('tx que lança desfaz tudo', async () => {
  await expect(db.tx(async (d) => {
    await d.run("INSERT INTO settings(key, value) VALUES ('k1', 'v')")
    throw new Error('boom')
  })).rejects.toThrow('boom')
  expect(await db.one("SELECT 1 FROM settings WHERE key = 'k1'")).toBeUndefined()
})

test('tx aninhado que lança desfaz só o interno quando capturado', async () => {
  await db.tx(async (d) => {
    await d.run("INSERT INTO settings(key, value) VALUES ('outer', 'v')")
    await expect(d.tx(async (d2) => {
      await d2.run("INSERT INTO settings(key, value) VALUES ('inner', 'v')")
      throw new Error('inner boom')
    })).rejects.toThrow('inner boom')
    await d.tx(async (d2) => { await d2.run("INSERT INTO settings(key, value) VALUES ('inner2', 'v')") })
  })
  expect((await db.many<{ key: string }>('SELECT key FROM settings ORDER BY key')).map((r) => r.key)).toEqual(['inner2', 'outer'])
})

test('esquema: as 21 tabelas da v7 existem e schema_version = LATEST', async () => {
  const rows = await db.many<{ t: string }>("SELECT tablename t FROM pg_tables WHERE schemaname = 'public' AND tablename <> 'schema_version' ORDER BY 1")
  expect(rows.map((r) => r.t)).toEqual(V7_TABLES)
  expect(await db.many('SELECT version FROM schema_version')).toEqual([{ version: LATEST_SCHEMA_VERSION }])
  expect(LATEST_SCHEMA_VERSION).toBe(2)
  const rls = await db.many<{ t: string }>("SELECT relname t FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relkind = 'r' AND NOT relrowsecurity")
  expect(rls).toEqual([])
})

test('seed: Pessoal único e dashboard Geral; runMigrations é idempotente', async () => {
  expect(await db.many('SELECT name FROM companies WHERE is_personal = 1')).toEqual([{ name: 'Pessoal' }])
  await expect(db.run("INSERT INTO companies(name, color, is_personal) VALUES ('X', '#000', 1)")).rejects.toThrow()
  expect(await db.many('SELECT name, scope, position FROM dashboards')).toEqual([{ name: 'Geral', scope: '"all"', position: 1024 }])
  expect((await db.one<{ n: number }>('SELECT count(*) n FROM dashboard_widgets'))!.n).toBeGreaterThan(0)
  expect(await runMigrations(db)).toEqual({ from: 2, to: 2 })
  expect((await db.one<{ n: number }>('SELECT count(*) n FROM dashboards'))!.n).toBe(1)
})

test('runMigrations com seed: false deixa o banco vazio; schema mais novo é recusado', async () => {
  const fresh = await createPgliteDb()
  try {
    expect(await runMigrations(fresh, { seed: false })).toEqual({ from: 0, to: 2 })
    expect((await fresh.one<{ n: number }>('SELECT count(*) n FROM companies'))!.n).toBe(0)
    expect((await fresh.one<{ n: number }>('SELECT count(*) n FROM dashboards'))!.n).toBe(0)
    await fresh.run('UPDATE schema_version SET version = 99')
    await expect(runMigrations(fresh)).rejects.toMatchObject({ code: 'SCHEMA_TOO_NEW' })
  } finally {
    await closePgliteDb(fresh)
  }
})

test('INSERT em tasks alimenta search_index com norm sem acento; UPDATE atualiza', async () => {
  const s = await seedTree(db)
  const row = await db.one('SELECT entity_type, entity_id, title, body, norm FROM search_index WHERE entity_type = ? AND entity_id = ?', ['task', s.task])
  expect(row).toEqual({ entity_type: 'task', entity_id: s.task, title: 'Orçamento Ação', body: 'Revisão da PROPOSTA', norm: 'orcamento acao revisao da proposta' })
  await db.run("UPDATE tasks SET title = 'Contrato' WHERE id = ?", [s.task])
  expect((await db.one<{ norm: string }>("SELECT norm FROM search_index WHERE entity_type = 'task' AND entity_id = ?", [s.task]))!.norm)
    .toBe('contrato revisao da proposta')
  expect(await db.many("SELECT entity_type, title FROM search_index WHERE entity_type IN ('company', 'project') ORDER BY 1, 2")).toEqual([
    { entity_type: 'company', title: 'Empresa A' }, { entity_type: 'company', title: 'Pessoal' }, { entity_type: 'project', title: 'CRM' }
  ])
  expect((await db.one<{ n: string }>("SELECT norm_text('AÇÃO Ñandú') n"))!.n).toBe('acao nandu')
})

test('excluir tarefa desvincula seus day_blocks (título preservado) e apaga a linha de busca', async () => {
  const s = await seedTree(db)
  const b = (await db.one<{ id: number }>(
    "INSERT INTO day_blocks(date, start_time, end_time, task_id) VALUES ('2026-11-25', '09:00', '10:00', ?) RETURNING id", [s.task]
  ))!.id
  await db.run('DELETE FROM tasks WHERE id = ?', [s.task])
  expect(await db.one('SELECT task_id, title FROM day_blocks WHERE id = ?', [b])).toEqual({ task_id: null, title: 'Orçamento Ação (tarefa excluída)' })
  expect(await db.one("SELECT 1 FROM search_index WHERE entity_type = 'task' AND entity_id = ?", [s.task])).toBeUndefined()
})

test('cascade de empresa apaga tudo e remove do search_index', async () => {
  const s = await seedTree(db)
  await db.run('DELETE FROM companies WHERE id = ?', [s.co])
  for (const tbl of ['projects', 'boards', 'columns', 'tasks']) {
    expect((await db.one<{ n: number }>(`SELECT count(*) n FROM ${tbl}`))!.n).toBe(0)
  }
  expect(await db.many("SELECT entity_type FROM search_index WHERE entity_type <> 'company'")).toEqual([])
})

test('v_tasks: status, due_end e effective_archived herdado do projeto e da pasta avó', async () => {
  const s = await seedTree(db)
  let row = await db.one('SELECT status, due_end, effective_archived, company_id, project_id FROM v_tasks WHERE id = ?', [s.task])
  expect(row).toEqual({ status: 'done', due_end: '2026-11-25T23:59', effective_archived: 0, company_id: s.co, project_id: s.p })

  const grand = (await db.one<{ id: number }>("INSERT INTO folders(company_id, name) VALUES (?, 'Avó') RETURNING id", [s.co]))!.id
  const parent = (await db.one<{ id: number }>("INSERT INTO folders(company_id, parent_id, name) VALUES (?, ?, 'Mãe') RETURNING id", [s.co, grand]))!.id
  await db.run('UPDATE projects SET folder_id = ? WHERE id = ?', [parent, s.p])
  expect((await db.one<{ e: number }>('SELECT effective_archived e FROM v_tasks WHERE id = ?', [s.task]))!.e).toBe(0)
  await db.run("UPDATE folders SET archived_at = '2026-01-01T00:00:00.000Z' WHERE id = ?", [grand])
  expect((await db.one<{ e: number }>('SELECT effective_archived e FROM v_tasks WHERE id = ?', [s.task]))!.e).toBe(1)

  await db.run('UPDATE folders SET archived_at = NULL WHERE id = ?', [grand])
  await db.run("UPDATE projects SET archived_at = '2026-01-01' WHERE id = ?", [s.p])
  expect((await db.one<{ e: number }>('SELECT effective_archived e FROM v_tasks WHERE id = ?', [s.task]))!.e).toBe(1)
})

test('defaults: datas ISO UTC com milissegundos, position double precision', async () => {
  const r = await db.one<{ iso: string }>('SELECT iso_now() iso')
  expect(r!.iso).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
  const c = (await db.one<{ created_at: string; position: number }>('SELECT created_at, position FROM companies WHERE is_personal = 1'))!
  expect(c.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
  expect(Math.abs(Date.parse(c.created_at) - Date.now())).toBeLessThan(10 * 60_000)
  await db.run('UPDATE companies SET position = 1.25 WHERE is_personal = 1')
  expect((await db.one<{ position: number }>('SELECT position FROM companies WHERE is_personal = 1'))!.position).toBe(1.25)
})

test('id explícito 50 e depois sem id → novo id > 50 após syncSequences', async () => {
  await db.run("INSERT INTO labels(id, name, color) VALUES (50, 'Cinquenta', '#000')")
  await db.run("INSERT INTO shopping_items(id, name) VALUES (7, 'Pão')")
  await syncSequences(db)
  const next = (await db.one<{ id: number }>("INSERT INTO labels(name, color) VALUES ('Nova', '#111') RETURNING id"))!.id
  expect(next).toBeGreaterThan(50)
  expect((await db.one<{ id: number }>("INSERT INTO shopping_items(name) VALUES ('Leite') RETURNING id"))!.id).toBe(8)
  expect((await db.one<{ id: number }>("INSERT INTO ideas(title) VALUES ('Primeira') RETURNING id"))!.id).toBe(1)
})

test('attachments exige exatamente um dono', async () => {
  const s = await seedTree(db)
  await expect(db.run("INSERT INTO attachments(original_name, stored_path) VALUES ('x', 'y')")).rejects.toThrow()
  await expect(db.run("INSERT INTO attachments(task_id, project_id, original_name, stored_path) VALUES (?, ?, 'x', 'y')", [s.task, s.p])).rejects.toThrow()
  await db.run("INSERT INTO attachments(task_id, original_name, stored_path) VALUES (?, 'Relatório final (v2).pdf', 'a/b.pdf')", [s.task])
  expect((await db.one<{ norm: string }>("SELECT norm FROM search_index WHERE entity_type = 'attachment'"))!.norm).toBe('relatorio final (v2).pdf ')
})

test('anon/authenticated sem privilégio nas tabelas, sequências e view', async () => {
  // Supabase roles exist only on the real server; simulate them (with Supabase-like default grants) in a fresh PGlite.
  const fresh = await createPgliteDb()
  try {
    await fresh.exec(`
      CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN;
      GRANT USAGE ON SCHEMA public TO anon, authenticated;
      ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated;
      ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated;
    `)
    await runMigrations(fresh)
    const q = await fresh.one<Record<string, boolean>>(`SELECT
      has_table_privilege('anon', 'tasks', 'select') a,
      has_table_privilege('authenticated', 'companies', 'insert') b,
      has_table_privilege('anon', 'v_tasks', 'select') c,
      has_table_privilege('anon', 'schema_version', 'select') d,
      has_sequence_privilege('anon', pg_get_serial_sequence('tasks', 'id'), 'usage') e`)
    expect(q).toEqual({ a: false, b: false, c: false, d: false, e: false })
    await fresh.exec('CREATE TABLE later_table (x int)')
    expect((await fresh.one<{ p: boolean }>("SELECT has_table_privilege('anon', 'later_table', 'select') p"))!.p).toBe(false)
  } finally {
    await closePgliteDb(fresh)
  }
})

test('createTestDb: cada banco começa limpo e dois bancos vivos são independentes', async () => {
  await db.run("INSERT INTO settings(key, value) VALUES ('so-no-primeiro', '1')")
  await db.run("INSERT INTO labels(name, color) VALUES ('L1', '#000')")
  const other = await createTestDb()
  try {
    expect(await other.db.one("SELECT 1 FROM settings WHERE key = 'so-no-primeiro'")).toBeUndefined()
    expect((await other.db.one<{ id: number }>("INSERT INTO labels(name, color) VALUES ('L1', '#000') RETURNING id"))!.id).toBe(1)
    expect(await other.db.many('SELECT name FROM companies')).toEqual([{ name: 'Pessoal' }])
  } finally {
    await other.cleanup()
  }
  await t.cleanup()
  t = await createTestDb()
  expect(await t.db.many('SELECT key FROM settings')).toEqual([])
  expect((await t.db.one<{ id: number }>("INSERT INTO labels(name, color) VALUES ('L2', '#000') RETURNING id"))!.id).toBe(1)
  expect((await t.db.one<{ id: number }>('SELECT id FROM companies WHERE is_personal = 1'))!.id).toBe(1)
  expect(await t.db.many('SELECT version FROM schema_version')).toEqual([{ version: LATEST_SCHEMA_VERSION }])
})
