import { createCompany } from '@server/services/companies'
import { createProject } from '@server/services/projects'
import { createLabel } from '@server/services/labels'
import { listIdeas, listIdeaCategories, createIdea, getIdea, updateIdea, setIdeaLabels, deleteIdea } from '@server/services/ideas'
import { search } from '@server/services/search'
import { createTestCtx } from '../helpers/ctx'

let T: Awaited<ReturnType<typeof createTestCtx>>
beforeEach(async () => { T = await createTestCtx() })
afterEach(() => T.cleanup())

test('CRUD, filtros, categorias e etiquetas', async () => {
  const emp = await createCompany(T.ctx, { name: 'Empresa A', color: '#f00' })
  const a = await createIdea(T.ctx, { title: 'App de finanças' })
  expect(a).toMatchObject({ status: 'new', priority: 'medium', category: '' })
  const b = await createIdea(T.ctx, { title: 'Automação SDR', category: 'Negócio', priority: 'high', companyId: emp.id })
  await updateIdea(T.ctx, a.id, { category: 'Pessoal', status: 'analysis', description: 'controle de gastos' })
  const l = await createLabel(T.ctx, { name: 'IA', color: '#000' })
  await setIdeaLabels(T.ctx, b.id, [l.id])
  expect((await listIdeas(T.ctx, {})).map((i) => i.title)).toEqual(['Automação SDR', 'App de finanças'])
  expect((await listIdeas(T.ctx, { status: ['analysis'] })).map((i) => i.id)).toEqual([a.id])
  expect((await listIdeas(T.ctx, { companyId: emp.id }))[0]).toMatchObject({ id: b.id, companyName: 'Empresa A', labels: [{ name: 'IA' }] })
  expect((await listIdeas(T.ctx, { labelId: l.id })).map((i) => i.id)).toEqual([b.id])
  expect((await listIdeas(T.ctx, { text: 'gastos' })).map((i) => i.id)).toEqual([a.id])
  expect((await listIdeas(T.ctx, { priority: 'high' })).map((i) => i.id)).toEqual([b.id])
  expect(await listIdeaCategories(T.ctx)).toEqual(['Negócio', 'Pessoal'])
  expect(await getIdea(T.ctx, b.id)).toMatchObject({ company: { name: 'Empresa A' }, project: null, labels: [{ name: 'IA' }], attachments: [] })
  await expect(createIdea(T.ctx, { title: ' ' })).rejects.toMatchObject({ code: 'VALIDATION' })
  await deleteIdea(T.ctx, a.id)
  expect((await listIdeas(T.ctx, {})).map((i) => i.id)).toEqual([b.id])
})

test('projeto precisa pertencer à empresa escolhida', async () => {
  const emp = await createCompany(T.ctx, { name: 'E', color: '#f00' })
  const p = await createProject(T.ctx, { companyId: 1, folderId: null, name: 'Pessoal P', color: '#000' })
  await expect(createIdea(T.ctx, { title: 'x', companyId: emp.id, projectId: p.id })).rejects.toMatchObject({ code: 'VALIDATION' })
  expect(await createIdea(T.ctx, { title: 'y', projectId: p.id })).toMatchObject({ projectId: p.id })
})

// Task 5: needs addAttachments (Storage upload).
test.skip('converter em tarefa copia dados e anexos; segunda conversão é recusada', () => {})

// Task 5: needs addAttachments (Storage upload).
test.skip('converter em projeto e anexos de ideias na página de arquivos', () => {})

test('busca encontra ideias sem acento', async () => {
  await createIdea(T.ctx, { title: 'Integração com WhatsApp', description: 'notificações' })
  expect((await search(T.ctx, { text: 'integracao' })).ideas.map((i) => i.title)).toEqual(['Integração com WhatsApp'])
  expect((await search(T.ctx, { text: 'notificacoes' })).ideas).toHaveLength(1)
})
