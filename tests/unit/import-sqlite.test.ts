import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Db } from '@server/db/db'
import { runMigrations } from '@server/db/migrate'
import { closePgliteDb, createPgliteDb } from '@server/db/pglite'
import { compareDatasets, exportDataset } from '@server/services/dataset'
import { createLocalStorage } from '@server/storage/local'
import { runLegacyMigrations } from '../../scripts/sqlite-legacy/migrations'
import { readSqliteDataset } from '../../scripts/sqlite-legacy/read'
import { formatReport, runImport } from '../../scripts/sqlite-legacy/import'

const STORED = '2026/11/0b6c-Relatório final (v2).pdf'
const LOGO = 'logos/2-1f2e.png'
const PDF = Buffer.alloc(70_000, 7)
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3])

/** A desktop v7 database with realistic data, plus its data folder (attachments/, logos/). */
function buildFixture(root: string): { dbFile: string; filesDir: string } {
  const filesDir = join(root, 'data')
  mkdirSync(join(filesDir, 'attachments', '2026', '11'), { recursive: true })
  mkdirSync(join(filesDir, 'logos'), { recursive: true })
  writeFileSync(join(filesDir, 'attachments', ...STORED.split('/')), PDF)
  writeFileSync(join(filesDir, LOGO), PNG)
  const dbFile = join(filesDir, 'hub.db')
  const db = new Database(dbFile)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  runLegacyMigrations(db)
  db.exec(`
    INSERT INTO companies(id, name, description, color, logo_path, position, created_at, updated_at)
      VALUES (2, 'Ação Cliente Ltda', 'Consultoria — orçamento "anual"', '#10B981', '${LOGO}', 1536.75, '2026-01-02T10:00:00.000Z', '2026-01-02T10:00:00.000Z');
    INSERT INTO companies(id, name, color, status, archived_at, position) VALUES (3, 'Antiga S/A', '#999999', 'archived', '2026-03-01T00:00:00.000Z', 2048.125);
    -- folder 1 was later moved under folder 3 (parent has a higher id); 3 is archived: 1 and 2 are archived by ancestry
    INSERT INTO folders(id, company_id, parent_id, name, position) VALUES (1, 2, NULL, 'Operação', 1024);
    INSERT INTO folders(id, company_id, parent_id, name, color, position) VALUES (2, 2, 1, 'Subpasta ç', '#FF0000', 1024.5);
    INSERT INTO folders(id, company_id, parent_id, name, position, archived_at) VALUES (3, 2, NULL, 'Arquivo morto', 3072.333333333333, '2026-05-05T12:00:00.000Z');
    UPDATE folders SET parent_id = 3 WHERE id = 1;
    INSERT INTO projects(id, company_id, folder_id, name, description, color, start_date, due_date, position)
      VALUES (1, 2, 2, 'Migração do ERP', 'Fase única', '#3B82F6', NULL, '2026-12-15', 0.5);
    INSERT INTO projects(id, company_id, name, color, status, position) VALUES (2, 1, 'Casa', '#F59E0B', 'paused', 1024);
    INSERT INTO boards(id, project_id, name, position, color) VALUES (1, 1, 'Quadro principal', 1024, NULL), (2, 2, 'Reforma', 1024, '#abcdef');
    INSERT INTO columns(id, board_id, name, position, category) VALUES
      (1, 1, 'A fazer', 1024, 'todo'), (2, 1, 'Fazendo', 2048, 'in_progress'), (3, 1, 'Concluído', 3072, 'done'), (4, 2, 'Lista', 1024, 'todo');
    INSERT INTO tasks(id, board_id, column_id, title, description, priority, start_at, due_at, position, color) VALUES
      (1, 1, 1, 'Revisão do orçamento – março', 'Linha 1
Linha 2 com “aspas” e emoji 🚀', 'urgent', '2026-11-20T09:00', '2026-11-30', 1536.75, NULL),
      (2, 1, 3, 'Entregar relatório', '', 'low', NULL, NULL, 0.001, '#ff00ff');
    UPDATE tasks SET completed_at = '2026-11-21T18:30:00.000Z' WHERE id = 2;
    INSERT INTO tasks(id, board_id, column_id, title, archived_at, position) VALUES (5, 2, 4, 'Pintar a sala', '2026-10-10T10:10:10.010Z', 1024);
    INSERT INTO labels(id, name, color) VALUES (1, 'Financeiro', '#111111'), (2, 'Urgência', '#222222');
    INSERT INTO task_labels(task_id, label_id) VALUES (1, 1), (1, 2), (5, 2);
    INSERT INTO comments(id, task_id, body) VALUES (1, 1, 'Conferir com a contabilidade às 14h'), (4, 2, 'ok');
    INSERT INTO checklists(id, task_id, title, position) VALUES (1, 1, 'Passos', 1024);
    INSERT INTO checklist_items(id, checklist_id, text, done, position, completed_at) VALUES
      (1, 1, 'Levantar números', 1, 1024, '2026-11-22T08:00:00.000Z'), (2, 1, 'Validar', 0, 1536.5, NULL);
    INSERT INTO ideas(id, title, description, category, status, company_id, project_id, converted_task_id, position)
      VALUES (1, 'Automatizar relatório', 'Gerar PDF sozinho', 'Melhoria', 'implemented', 2, 1, 2, 512.25),
             (2, 'Ideia solta', '', '', 'new', NULL, NULL, NULL, 1024);
    INSERT INTO idea_labels(idea_id, label_id) VALUES (1, 1);
    INSERT INTO attachments(id, task_id, original_name, stored_path, mime_type, size_bytes)
      VALUES (1, 1, 'Relatório final (v2).pdf', '${STORED}', 'application/pdf', ${PDF.length});
    INSERT INTO activity_log(entity_type, entity_id, task_id, action, field, old_value, new_value)
      VALUES ('task', 1, 1, 'update', 'title', 'Revisao', 'Revisão do orçamento – março'), ('task', 99, NULL, 'delete', NULL, NULL, NULL);
    INSERT INTO settings(key, value) VALUES ('theme', '"dark"'), ('Zeta', '1'), ('alpha', '{"a":[1,2]}');
    INSERT INTO day_blocks(date, start_time, end_time, task_id, title, note, done, color)
      VALUES ('2026-11-26', '09:00', '10:30', 1, NULL, '', 0, NULL), ('2026-11-26', '14:00', '15:00', NULL, 'Almoço com sócio', 'nota', 1, '#00ff00');
    INSERT INTO shopping_items(name, notes, quantity, unit, category, price_cents, url, status, bought_at, position) VALUES
      ('Café', 'torra média', 1.5, 'kg', 'Mercado', 4590, NULL, 'pending', NULL, 1024),
      ('Lâmpada', '', 3, 'un', '', NULL, 'https://example.com/a?b=1&c=2', 'bought', '2026-11-25T20:00:00.000Z', 2048.75);
  `)
  const dash = db.prepare('SELECT id FROM dashboards').get() as { id: number }
  db.prepare("INSERT INTO dashboard_widgets(dashboard_id, type, title, config, x, y, w, h) VALUES (?, 'kpi', 'Atrasadas', '{\"metric\":\"overdue\"}', 0, 9, 3, 2)").run(dash.id)
  // Keep the newest writes in the WAL (as when the desktop app is open).
  db.pragma('wal_autocheckpoint = 0')
  db.prepare("UPDATE tasks SET title = 'Revisão do orçamento – março (v2)' WHERE id = 1").run()
  // The connection stays open on purpose: the importer must work while the desktop app is running.
  return { dbFile, filesDir }
}

describe('SQLite → Postgres import', () => {
  let root: string
  let fixture: { dbFile: string; filesDir: string }
  let pg: Db

  beforeAll(async () => {
    root = mkdtempSync(join(tmpdir(), 'pth-import-test-'))
    fixture = buildFixture(root)
    pg = await createPgliteDb()
    await runMigrations(pg, { seed: false })
  })
  afterAll(async () => {
    await closePgliteDb(pg)
    rmSync(root, { recursive: true, force: true })
  })

  it('imports every row and file identically, then refuses a second import without --replace', async () => {
    const storage = createLocalStorage(join(root, 'bucket'))
    const source = readSqliteDataset(fixture.dbFile)
    expect(source.tables.tasks.find((t) => t.id === 1)?.title).toBe('Revisão do orçamento – março (v2)')
    expect(source.manifest.counts).toMatchObject({ companies: 3, folders: 3, tasks: 3, attachments: 1, shopping_items: 2 })

    const report = await runImport({ db: pg, storage, dbFile: fixture.dbFile, filesDir: fixture.filesDir, replace: false })
    const text = formatReport(report)
    expect(report.diffs, text).toEqual([])
    expect(report.ok, text).toBe(true)
    expect(report.files).toMatchObject({ sent: 2, verified: 2, missing: [], mismatched: [] })
    expect(compareDatasets(source, await exportDataset(pg, new Date()))).toEqual([])

    // Files at the same relative paths as the columns.
    expect(Buffer.from(await storage.get(`attachments/${STORED}`)).equals(PDF)).toBe(true)
    expect(Buffer.from(await storage.get(LOGO)).equals(PNG)).toBe(true)
    // Search index rebuilt (accent-free), folder chain archived, sequences after the imported ids.
    expect(await pg.many("SELECT entity_type, entity_id FROM search_index WHERE norm LIKE '%revisao do orcamento%' ORDER BY 1, 2")).toEqual([
      { entity_type: 'task', entity_id: 1 }
    ])
    expect(await pg.one('SELECT effective_archived FROM v_tasks WHERE id = 1')).toEqual({ effective_archived: 1 })
    const next = await pg.one<{ id: number }>("INSERT INTO comments(task_id, body) VALUES (1, 'novo') RETURNING id")
    expect(next!.id).toBe(5)
    await pg.run('DELETE FROM comments WHERE id = 5')

    await expect(runImport({ db: pg, storage, dbFile: fixture.dbFile, filesDir: fixture.filesDir, replace: false })).rejects.toMatchObject({
      code: 'CONFLICT'
    })
    const again = await runImport({ db: pg, storage, dbFile: fixture.dbFile, filesDir: fixture.filesDir, replace: true })
    expect(again.ok, formatReport(again)).toBe(true)
  })
})
