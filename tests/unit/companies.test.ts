import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  listCompanies, getCompany, createCompany, updateCompany, archiveCompany, restoreCompany,
  getCompanyDeletionImpact, deleteCompany, setCompanyLogo, reorderCompany
} from '@main/services/companies'
import { createTestCtx, tempFile } from '../helpers/ctx'

let T: ReturnType<typeof createTestCtx>
beforeEach(() => { T = createTestCtx() })
afterEach(() => T.cleanup())

function seedTask(companyId: number, due: string | null, category: 'todo' | 'done' = 'todo') {
  const db = T.ctx.db
  const p = db.prepare("INSERT INTO projects(company_id, name, color) VALUES (?, 'P', '#000')").run(companyId).lastInsertRowid
  const b = db.prepare("INSERT INTO boards(project_id, name) VALUES (?, 'B')").run(p).lastInsertRowid
  const c = db.prepare("INSERT INTO columns(board_id, name, category) VALUES (?, 'C', ?)").run(b, category).lastInsertRowid
  const t = db.prepare("INSERT INTO tasks(board_id, column_id, title, due_at) VALUES (?, ?, 'T', ?)").run(b, c, due).lastInsertRowid
  return { p: Number(p), b: Number(b), c: Number(c), t: Number(t) }
}

test('cria e edita empresa', () => {
  const c = createCompany(T.ctx, { name: 'Empresa A', color: '#ff0000', description: 'x' })
  expect(c).toMatchObject({ name: 'Empresa A', color: '#ff0000', isPersonal: false, status: 'active' })
  expect(updateCompany(T.ctx, c.id, { name: 'Empresa B' }).name).toBe('Empresa B')
  expect(getCompany(T.ctx, c.id).description).toBe('x')
})

test('nome vazio → VALIDATION', () => {
  expect(() => createCompany(T.ctx, { name: '  ', color: '#000' })).toThrow(expect.objectContaining({ code: 'VALIDATION' }))
})

test('arquivar e restaurar; Pessoal não arquiva nem exclui', () => {
  const c = createCompany(T.ctx, { name: 'A', color: '#000' })
  expect(archiveCompany(T.ctx, c.id).status).toBe('archived')
  expect(listCompanies(T.ctx, {}).map((x) => x.id)).not.toContain(c.id)
  expect(listCompanies(T.ctx, { includeArchived: true }).map((x) => x.id)).toContain(c.id)
  expect(restoreCompany(T.ctx, c.id).status).toBe('active')
  const pessoal = listCompanies(T.ctx, {})[0]
  expect(pessoal.isPersonal).toBe(true)
  expect(() => archiveCompany(T.ctx, pessoal.id)).toThrow(expect.objectContaining({ code: 'FORBIDDEN' }))
  expect(() => deleteCompany(T.ctx, pessoal.id)).toThrow(expect.objectContaining({ code: 'FORBIDDEN' }))
})

test('listCompanies conta abertas e atrasadas; Pessoal primeiro', () => {
  const c = createCompany(T.ctx, { name: 'A', color: '#000' })
  seedTask(c.id, '2026-11-20')
  seedTask(c.id, '2026-11-30')
  seedTask(c.id, '2026-11-01', 'done')
  const list = listCompanies(T.ctx, {})
  expect(list[0].isPersonal).toBe(true)
  expect(list.find((x) => x.id === c.id)).toMatchObject({ activeProjects: 3, openTasks: 2, overdueTasks: 1 })
})

test('deletionImpact e delete movem anexo para attachments-deleted', () => {
  const c = createCompany(T.ctx, { name: 'A', color: '#000' })
  const s = seedTask(c.id, null)
  T.ctx.db.prepare("INSERT INTO attachments(task_id, original_name, stored_path) VALUES (?, 'a.txt', '2026/11/x-a.txt')").run(s.t)
  const { mkdirSync, writeFileSync } = require('node:fs')
  mkdirSync(join(T.ctx.paths.attachments, '2026/11'), { recursive: true })
  writeFileSync(join(T.ctx.paths.attachments, '2026/11/x-a.txt'), 'hello')
  expect(getCompanyDeletionImpact(T.ctx, c.id)).toEqual({ projects: 1, tasks: 1, attachments: 1 })
  deleteCompany(T.ctx, c.id)
  expect(() => getCompany(T.ctx, c.id)).toThrow(expect.objectContaining({ code: 'NOT_FOUND' }))
  expect(existsSync(join(T.ctx.paths.attachments, '2026/11/x-a.txt'))).toBe(false)
  expect(readFileSync(join(T.ctx.paths.attachmentsDeleted, '2026/11/x-a.txt'), 'utf8')).toBe('hello')
})

test('setCompanyLogo copia arquivo e troca o anterior', () => {
  const c = createCompany(T.ctx, { name: 'A', color: '#000' })
  const a = setCompanyLogo(T.ctx, c.id, tempFile('logo.png', 'one'))
  expect(a.logoPath).toMatch(/^logos\//)
  const first = join(T.ctx.paths.root, a.logoPath!)
  expect(readFileSync(first, 'utf8')).toBe('one')
  const b = setCompanyLogo(T.ctx, c.id, tempFile('logo2.png', 'two'))
  expect(existsSync(first)).toBe(false)
  expect(readFileSync(join(T.ctx.paths.root, b.logoPath!), 'utf8')).toBe('two')
  expect(setCompanyLogo(T.ctx, c.id, null).logoPath).toBeNull()
})

test('reorderCompany muda a ordem', () => {
  const a = createCompany(T.ctx, { name: 'A', color: '#000' })
  const b = createCompany(T.ctx, { name: 'B', color: '#000' })
  reorderCompany(T.ctx, b.id, { beforeId: null, afterId: a.id })
  const names = listCompanies(T.ctx, {}).filter((x) => !x.isPersonal).map((x) => x.name)
  expect(names).toEqual(['B', 'A'])
})
