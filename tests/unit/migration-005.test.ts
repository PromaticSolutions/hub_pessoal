import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openDatabase } from '@main/db/connection'
import { runMigrations } from '@main/db/migrate'
import { migrations } from '@main/db/migrations'

test('005 cria ideias e reconstrói anexos preservando ids, caminhos e busca', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pth-mig5-'))
  const db = openDatabase(join(dir, 'hub.db'))
  runMigrations(db, { migrations: migrations.filter((m) => m.version <= 4) })
  db.exec("INSERT INTO projects(company_id, name, color) VALUES (1, 'P', '#000')")
  db.exec("INSERT INTO boards(project_id, name) VALUES (1, 'B')")
  db.exec("INSERT INTO columns(board_id, name) VALUES (1, 'C')")
  db.exec("INSERT INTO tasks(board_id, column_id, title) VALUES (1, 1, 'T')")
  db.exec("INSERT INTO attachments(id, task_id, original_name, stored_path, size_bytes) VALUES (7, 1, 'contrato assinado.pdf', '2026/11/a-contrato.pdf', 10)")
  db.exec("INSERT INTO attachments(id, project_id, original_name, stored_path) VALUES (9, 1, 'planta.png', '2026/11/b-planta.png')")
  runMigrations(db, { preMigrationDir: join(dir, 'pre') })
  expect(db.prepare('SELECT id, task_id, project_id, idea_id, original_name, stored_path, size_bytes FROM attachments ORDER BY id').all()).toEqual([
    { id: 7, task_id: 1, project_id: null, idea_id: null, original_name: 'contrato assinado.pdf', stored_path: '2026/11/a-contrato.pdf', size_bytes: 10 },
    { id: 9, task_id: null, project_id: 1, idea_id: null, original_name: 'planta.png', stored_path: '2026/11/b-planta.png', size_bytes: 0 }
  ])
  expect(db.prepare("SELECT count(*) n FROM search_index WHERE search_index MATCH 'contrato'").get()).toEqual({ n: 1 })
  db.exec("INSERT INTO ideas(title, description) VALUES ('Automação de propostas', 'gerar PDF')")
  expect(db.prepare("SELECT entity_type FROM search_index WHERE search_index MATCH 'automacao'").all()).toEqual([{ entity_type: 'idea' }])
  db.exec("INSERT INTO attachments(idea_id, original_name, stored_path) VALUES (1, 'rascunho.txt', 'x/r.txt')")
  expect(db.prepare("SELECT count(*) n FROM search_index WHERE search_index MATCH 'rascunho'").get()).toEqual({ n: 1 })
  expect(() => db.exec("INSERT INTO attachments(task_id, idea_id, original_name, stored_path) VALUES (1, 1, 'x', 'y')")).toThrow()
  expect(() => db.exec("INSERT INTO attachments(original_name, stored_path) VALUES ('x', 'y')")).toThrow()
  const next = db.prepare("INSERT INTO attachments(task_id, original_name, stored_path) VALUES (1, 'n', 'n')").run().lastInsertRowid
  expect(Number(next)).toBeGreaterThan(9)
  db.exec('DELETE FROM ideas WHERE id = 1')
  expect(db.prepare('SELECT count(*) n FROM attachments WHERE idea_id IS NOT NULL').get()).toEqual({ n: 0 })
  expect(db.pragma('foreign_key_check')).toEqual([])
  expect(db.pragma('integrity_check', { simple: true })).toBe('ok')
  db.close()
})
