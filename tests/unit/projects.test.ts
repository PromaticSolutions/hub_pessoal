import { createCompany } from '@server/services/companies'
import { createFolder, updateFolder, moveFolder, deleteFolder, archiveFolder, restoreFolder } from '@server/services/folders'
import {
  createProject, getProject, updateProject, moveProject, archiveProject, restoreProject,
  getProjectDeletionImpact, deleteProject, getSpaceTree
} from '@server/services/projects'
import { createTestCtx } from '../helpers/ctx'

let T: Awaited<ReturnType<typeof createTestCtx>>
beforeEach(async () => { T = await createTestCtx() })
afterEach(() => T.cleanup())
const PESSOAL = 1

test('projeto novo tem quadro com 5 colunas nas categorias certas', async () => {
  const p = await createProject(T.ctx, { companyId: PESSOAL, folderId: null, name: 'Estudos', color: '#000' })
  const d = await getProject(T.ctx, p.id)
  expect(d.boards).toHaveLength(1)
  expect(d.boards[0].name).toBe('Quadro principal')
  const cols = (await T.ctx.db.many('SELECT name, category FROM columns WHERE board_id = ? ORDER BY position', [d.boards[0].id]))
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

test('mover pasta para dentro de descendente → VALIDATION', async () => {
  const a = await createFolder(T.ctx, { companyId: PESSOAL, parentId: null, name: 'A' })
  const b = await createFolder(T.ctx, { companyId: PESSOAL, parentId: a.id, name: 'B' })
  await expect(moveFolder(T.ctx, { id: a.id, companyId: PESSOAL, parentId: b.id, beforeId: null, afterId: null })).rejects.toMatchObject({ code: 'VALIDATION' })
  await expect(moveFolder(T.ctx, { id: a.id, companyId: PESSOAL, parentId: a.id, beforeId: null, afterId: null })).rejects.toMatchObject({ code: 'VALIDATION' })
})

test('mover pasta para outro espaço leva subpastas e projetos', async () => {
  const emp = await createCompany(T.ctx, { name: 'Empresa', color: '#000' })
  const a = await createFolder(T.ctx, { companyId: PESSOAL, parentId: null, name: 'A' })
  const b = await createFolder(T.ctx, { companyId: PESSOAL, parentId: a.id, name: 'B' })
  const p = await createProject(T.ctx, { companyId: PESSOAL, folderId: b.id, name: 'P', color: '#000' })
  await moveFolder(T.ctx, { id: a.id, companyId: emp.id, parentId: null, beforeId: null, afterId: null })
  expect((await T.ctx.db.one('SELECT company_id FROM folders WHERE id = ?', [b.id]))).toEqual({ company_id: emp.id })
  expect((await getProject(T.ctx, p.id)).companyId).toBe(emp.id)
})

test('excluir pasta sobe conteúdo um nível', async () => {
  const a = await createFolder(T.ctx, { companyId: PESSOAL, parentId: null, name: 'A' })
  const b = await createFolder(T.ctx, { companyId: PESSOAL, parentId: a.id, name: 'B' })
  const p = await createProject(T.ctx, { companyId: PESSOAL, folderId: a.id, name: 'P', color: '#000' })
  await deleteFolder(T.ctx, a.id)
  expect((await T.ctx.db.one('SELECT parent_id FROM folders WHERE id = ?', [b.id]))).toEqual({ parent_id: null })
  expect((await getProject(T.ctx, p.id)).folderId).toBeNull()
})

test('projeto com pasta de outro espaço → VALIDATION', async () => {
  const emp = await createCompany(T.ctx, { name: 'Empresa', color: '#000' })
  const f = await createFolder(T.ctx, { companyId: PESSOAL, parentId: null, name: 'A' })
  await expect(createProject(T.ctx, { companyId: emp.id, folderId: f.id, name: 'P', color: '#000' })).rejects.toMatchObject({ code: 'VALIDATION' })
  const p = await createProject(T.ctx, { companyId: emp.id, folderId: null, name: 'P', color: '#000' })
  await expect(moveProject(T.ctx, { id: p.id, companyId: emp.id, folderId: f.id, beforeId: null, afterId: null })).rejects.toMatchObject({ code: 'VALIDATION' })
})

test('árvore exclui arquivados por padrão e aninha pastas', async () => {
  const a = await createFolder(T.ctx, { companyId: PESSOAL, parentId: null, name: 'A' })
  const b = await createFolder(T.ctx, { companyId: PESSOAL, parentId: a.id, name: 'B' })
  await createProject(T.ctx, { companyId: PESSOAL, folderId: b.id, name: 'Dentro', color: '#000' })
  const arch = await createProject(T.ctx, { companyId: PESSOAL, folderId: null, name: 'Arq', color: '#000' })
  await archiveProject(T.ctx, arch.id)
  const tree = await getSpaceTree(T.ctx, {})
  const pessoal = tree.find((s) => s.company.isPersonal)!
  expect(pessoal.projects.map((p) => p.name)).toEqual([])
  expect(pessoal.folders[0].name).toBe('A')
  expect(pessoal.folders[0].children[0].projects[0].name).toBe('Dentro')
  const all = (await getSpaceTree(T.ctx, { includeArchived: true })).find((s) => s.company.isPersonal)!
  expect(all.projects.map((p) => p.name)).toEqual(['Arq'])
  await restoreProject(T.ctx, arch.id)
  await archiveFolder(T.ctx, a.id)
  expect((await getSpaceTree(T.ctx, {})).find((s) => s.company.isPersonal)!.folders).toEqual([])
  await restoreFolder(T.ctx, a.id)
  expect((await updateFolder(T.ctx, a.id, { name: 'AA' })).name).toBe('AA')
})

test('update, deletionImpact e delete de projeto', async () => {
  const p = await createProject(T.ctx, { companyId: PESSOAL, folderId: null, name: 'P', color: '#000' })
  expect(await updateProject(T.ctx, p.id, { status: 'paused', dueDate: '2026-12-01' })).toMatchObject({ status: 'paused', dueDate: '2026-12-01' })
  await expect(updateProject(T.ctx, p.id, { startDate: '2026-12-10' })).rejects.toMatchObject({ code: 'VALIDATION' })
  expect(await getProjectDeletionImpact(T.ctx, p.id)).toEqual({ boards: 1, tasks: 0, attachments: 0 })
  await deleteProject(T.ctx, p.id)
  await expect(getProject(T.ctx, p.id)).rejects.toMatchObject({ code: 'NOT_FOUND' })
})
