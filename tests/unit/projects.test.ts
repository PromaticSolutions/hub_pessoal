import { createCompany } from '@main/services/companies'
import { createFolder, updateFolder, moveFolder, deleteFolder, archiveFolder, restoreFolder } from '@main/services/folders'
import {
  createProject, getProject, updateProject, moveProject, archiveProject, restoreProject,
  getProjectDeletionImpact, deleteProject, getSpaceTree
} from '@main/services/projects'
import { createTestCtx } from '../helpers/ctx'

let T: ReturnType<typeof createTestCtx>
beforeEach(() => { T = createTestCtx() })
afterEach(() => T.cleanup())
const PESSOAL = 1

test('projeto novo tem quadro com 5 colunas nas categorias certas', () => {
  const p = createProject(T.ctx, { companyId: PESSOAL, folderId: null, name: 'Estudos', color: '#000' })
  const d = getProject(T.ctx, p.id)
  expect(d.boards).toHaveLength(1)
  expect(d.boards[0].name).toBe('Quadro principal')
  const cols = T.ctx.db.prepare('SELECT name, category FROM columns WHERE board_id = ? ORDER BY position').all(d.boards[0].id)
  expect(cols).toEqual([
    { name: 'Backlog', category: 'todo' },
    { name: 'A fazer', category: 'todo' },
    { name: 'Em andamento', category: 'in_progress' },
    { name: 'Em revisão', category: 'in_progress' },
    { name: 'Concluído', category: 'done' }
  ])
  expect(d.company.isPersonal).toBe(true)
  expect(d.taskCounts).toEqual({ total: 0, done: 0, overdue: 0 })
})

test('mover pasta para dentro de descendente → VALIDATION', () => {
  const a = createFolder(T.ctx, { companyId: PESSOAL, parentId: null, name: 'A' })
  const b = createFolder(T.ctx, { companyId: PESSOAL, parentId: a.id, name: 'B' })
  expect(() => moveFolder(T.ctx, { id: a.id, companyId: PESSOAL, parentId: b.id, beforeId: null, afterId: null })).toThrow(expect.objectContaining({ code: 'VALIDATION' }))
  expect(() => moveFolder(T.ctx, { id: a.id, companyId: PESSOAL, parentId: a.id, beforeId: null, afterId: null })).toThrow(expect.objectContaining({ code: 'VALIDATION' }))
})

test('mover pasta para outro espaço leva subpastas e projetos', () => {
  const emp = createCompany(T.ctx, { name: 'Empresa', color: '#000' })
  const a = createFolder(T.ctx, { companyId: PESSOAL, parentId: null, name: 'A' })
  const b = createFolder(T.ctx, { companyId: PESSOAL, parentId: a.id, name: 'B' })
  const p = createProject(T.ctx, { companyId: PESSOAL, folderId: b.id, name: 'P', color: '#000' })
  moveFolder(T.ctx, { id: a.id, companyId: emp.id, parentId: null, beforeId: null, afterId: null })
  expect(T.ctx.db.prepare('SELECT company_id FROM folders WHERE id = ?').get(b.id)).toEqual({ company_id: emp.id })
  expect(getProject(T.ctx, p.id).companyId).toBe(emp.id)
})

test('excluir pasta sobe conteúdo um nível', () => {
  const a = createFolder(T.ctx, { companyId: PESSOAL, parentId: null, name: 'A' })
  const b = createFolder(T.ctx, { companyId: PESSOAL, parentId: a.id, name: 'B' })
  const p = createProject(T.ctx, { companyId: PESSOAL, folderId: a.id, name: 'P', color: '#000' })
  deleteFolder(T.ctx, a.id)
  expect(T.ctx.db.prepare('SELECT parent_id FROM folders WHERE id = ?').get(b.id)).toEqual({ parent_id: null })
  expect(getProject(T.ctx, p.id).folderId).toBeNull()
})

test('projeto com pasta de outro espaço → VALIDATION', () => {
  const emp = createCompany(T.ctx, { name: 'Empresa', color: '#000' })
  const f = createFolder(T.ctx, { companyId: PESSOAL, parentId: null, name: 'A' })
  expect(() => createProject(T.ctx, { companyId: emp.id, folderId: f.id, name: 'P', color: '#000' })).toThrow(expect.objectContaining({ code: 'VALIDATION' }))
  const p = createProject(T.ctx, { companyId: emp.id, folderId: null, name: 'P', color: '#000' })
  expect(() => moveProject(T.ctx, { id: p.id, companyId: emp.id, folderId: f.id, beforeId: null, afterId: null })).toThrow(expect.objectContaining({ code: 'VALIDATION' }))
})

test('árvore exclui arquivados por padrão e aninha pastas', () => {
  const a = createFolder(T.ctx, { companyId: PESSOAL, parentId: null, name: 'A' })
  const b = createFolder(T.ctx, { companyId: PESSOAL, parentId: a.id, name: 'B' })
  createProject(T.ctx, { companyId: PESSOAL, folderId: b.id, name: 'Dentro', color: '#000' })
  const arch = createProject(T.ctx, { companyId: PESSOAL, folderId: null, name: 'Arq', color: '#000' })
  archiveProject(T.ctx, arch.id)
  const tree = getSpaceTree(T.ctx, {})
  const pessoal = tree.find((s) => s.company.isPersonal)!
  expect(pessoal.projects.map((p) => p.name)).toEqual([])
  expect(pessoal.folders[0].name).toBe('A')
  expect(pessoal.folders[0].children[0].projects[0].name).toBe('Dentro')
  const all = getSpaceTree(T.ctx, { includeArchived: true }).find((s) => s.company.isPersonal)!
  expect(all.projects.map((p) => p.name)).toEqual(['Arq'])
  restoreProject(T.ctx, arch.id)
  archiveFolder(T.ctx, a.id)
  expect(getSpaceTree(T.ctx, {}).find((s) => s.company.isPersonal)!.folders).toEqual([])
  restoreFolder(T.ctx, a.id)
  expect(updateFolder(T.ctx, a.id, { name: 'AA' }).name).toBe('AA')
})

test('update, deletionImpact e delete de projeto', () => {
  const p = createProject(T.ctx, { companyId: PESSOAL, folderId: null, name: 'P', color: '#000' })
  expect(updateProject(T.ctx, p.id, { status: 'paused', dueDate: '2026-12-01' })).toMatchObject({ status: 'paused', dueDate: '2026-12-01' })
  expect(() => updateProject(T.ctx, p.id, { startDate: '2026-12-10' })).toThrow(expect.objectContaining({ code: 'VALIDATION' }))
  expect(getProjectDeletionImpact(T.ctx, p.id)).toEqual({ boards: 1, tasks: 0, attachments: 0 })
  deleteProject(T.ctx, p.id)
  expect(() => getProject(T.ctx, p.id)).toThrow(expect.objectContaining({ code: 'NOT_FOUND' }))
})
