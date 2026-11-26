import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openDatabase } from '@main/db/connection'
import { runMigrations } from '@main/db/migrate'
import { migrations } from '@main/db/migrations'
import { createProject } from '@main/services/projects'
import { getBoard, updateBoard } from '@main/services/boards'
import { updateColumn } from '@main/services/columns'
import { createTask, updateTask, getTask } from '@main/services/tasks'
import { tint } from '@shared/colors'
import { createTestCtx } from '../helpers/ctx'

test('migração 003 preserva dados existentes com cores nulas', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pth-mig3-'))
  const db = openDatabase(join(dir, 'hub.db'))
  runMigrations(db, { migrations: migrations.filter((m) => m.version <= 2) })
  db.exec("INSERT INTO projects(company_id, name, color) VALUES (1, 'P', '#000')")
  db.exec("INSERT INTO boards(project_id, name) VALUES (1, 'B')")
  db.exec("INSERT INTO columns(board_id, name) VALUES (1, 'C')")
  db.exec("INSERT INTO tasks(board_id, column_id, title) VALUES (1, 1, 'T')")
  runMigrations(db, { preMigrationDir: join(dir, 'pre') })
  expect(db.prepare('SELECT b.color bc, c.color cc, t.color tc, t.title FROM tasks t JOIN boards b ON b.id = t.board_id JOIN columns c ON c.id = t.column_id').get()).toEqual({ bc: null, cc: null, tc: null, title: 'T' })
  db.close()
})

test('atualiza cores de quadro, coluna e cartão; cartão expõe cor no resumo', () => {
  const T = createTestCtx()
  const p = createProject(T.ctx, { companyId: 1, folderId: null, name: 'P', color: '#000' })
  const boardId = (T.ctx.db.prepare('SELECT id FROM boards WHERE project_id = ?').get(p.id) as { id: number }).id
  const col = getBoard(T.ctx, boardId, {}).columns[0]
  expect(updateBoard(T.ctx, boardId, { color: '#0EA5E9' }).color).toBe('#0EA5E9')
  expect(updateBoard(T.ctx, boardId, { name: 'Renomeado' })).toMatchObject({ name: 'Renomeado', color: '#0EA5E9' })
  expect(updateColumn(T.ctx, col.id, { color: '#F59E0B' }).color).toBe('#F59E0B')
  expect(updateColumn(T.ctx, col.id, { color: null }).color).toBeNull()
  const t = createTask(T.ctx, { columnId: col.id, title: 'x' })
  updateTask(T.ctx, t.id, { color: '#EC4899' })
  expect(getTask(T.ctx, t.id).color).toBe('#EC4899')
  expect(getBoard(T.ctx, boardId, {}).cards[0].color).toBe('#EC4899')
  const hist = T.ctx.db.prepare("SELECT count(*) n FROM activity_log WHERE field = 'color'").get() as { n: number }
  expect(hist.n).toBe(0)
  T.cleanup()
})

test('tint converte hex em rgba', () => {
  expect(tint('#0EA5E9', 0.07)).toBe('rgba(14, 165, 233, 0.07)')
  expect(tint('#abc', 0.5)).toBe('rgba(170, 187, 204, 0.5)')
})
