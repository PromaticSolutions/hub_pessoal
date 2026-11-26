import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createCompany } from '@main/services/companies'
import { createProject } from '@main/services/projects'
import { createLabel } from '@main/services/labels'
import { getTask } from '@main/services/tasks'
import { addAttachments, listAttachments } from '@main/services/attachments'
import { listIdeas, listIdeaCategories, createIdea, getIdea, updateIdea, setIdeaLabels, deleteIdea, convertIdeaToTask, convertIdeaToProject } from '@main/services/ideas'
import { search } from '@main/services/search'
import { createTestCtx, tempFile } from '../helpers/ctx'

let T: ReturnType<typeof createTestCtx>
beforeEach(() => { T = createTestCtx() })
afterEach(() => T.cleanup())

test('CRUD, filtros, categorias e etiquetas', () => {
  const emp = createCompany(T.ctx, { name: 'Empresa A', color: '#f00' })
  const a = createIdea(T.ctx, { title: 'App de finanças' })
  expect(a).toMatchObject({ status: 'new', priority: 'medium', category: '' })
  const b = createIdea(T.ctx, { title: 'Automação SDR', category: 'Negócio', priority: 'high', companyId: emp.id })
  updateIdea(T.ctx, a.id, { category: 'Pessoal', status: 'analysis', description: 'controle de gastos' })
  const l = createLabel(T.ctx, { name: 'IA', color: '#000' })
  setIdeaLabels(T.ctx, b.id, [l.id])
  expect(listIdeas(T.ctx, {}).map((i) => i.title)).toEqual(['Automação SDR', 'App de finanças'])
  expect(listIdeas(T.ctx, { status: ['analysis'] }).map((i) => i.id)).toEqual([a.id])
  expect(listIdeas(T.ctx, { companyId: emp.id })[0]).toMatchObject({ id: b.id, companyName: 'Empresa A', labels: [{ name: 'IA' }] })
  expect(listIdeas(T.ctx, { labelId: l.id }).map((i) => i.id)).toEqual([b.id])
  expect(listIdeas(T.ctx, { text: 'gastos' }).map((i) => i.id)).toEqual([a.id])
  expect(listIdeas(T.ctx, { priority: 'high' }).map((i) => i.id)).toEqual([b.id])
  expect(listIdeaCategories(T.ctx)).toEqual(['Negócio', 'Pessoal'])
  expect(getIdea(T.ctx, b.id)).toMatchObject({ company: { name: 'Empresa A' }, project: null, labels: [{ name: 'IA' }], attachments: [] })
  expect(() => createIdea(T.ctx, { title: ' ' })).toThrow(expect.objectContaining({ code: 'VALIDATION' }))
  deleteIdea(T.ctx, a.id)
  expect(listIdeas(T.ctx, {}).map((i) => i.id)).toEqual([b.id])
})

test('projeto precisa pertencer à empresa escolhida', () => {
  const emp = createCompany(T.ctx, { name: 'E', color: '#f00' })
  const p = createProject(T.ctx, { companyId: 1, folderId: null, name: 'Pessoal P', color: '#000' })
  expect(() => createIdea(T.ctx, { title: 'x', companyId: emp.id, projectId: p.id })).toThrow(expect.objectContaining({ code: 'VALIDATION' }))
  expect(createIdea(T.ctx, { title: 'y', projectId: p.id })).toMatchObject({ projectId: p.id })
})

test('converter em tarefa copia dados e anexos; segunda conversão é recusada', () => {
  const p = createProject(T.ctx, { companyId: 1, folderId: null, name: 'Destino', color: '#000' })
  const l = createLabel(T.ctx, { name: 'Cliente', color: '#000' })
  const idea = createIdea(T.ctx, { title: 'Proposta automática', description: 'gerar PDF', priority: 'urgent' })
  setIdeaLabels(T.ctx, idea.id, [l.id])
  const [att] = addAttachments(T.ctx, { ideaId: idea.id, sourcePaths: [tempFile('esboço.txt', 'rascunho')] })
  const task = convertIdeaToTask(T.ctx, { id: idea.id, projectId: p.id })
  const d = getTask(T.ctx, task.id)
  expect(d).toMatchObject({ title: 'Proposta automática', description: 'gerar PDF', priority: 'urgent', project: { id: p.id } })
  expect(d.labels.map((x) => x.name)).toEqual(['Cliente'])
  expect(d.attachments).toHaveLength(1)
  expect(d.attachments[0].storedPath).not.toBe(att.storedPath)
  expect(readFileSync(join(T.ctx.paths.attachments, d.attachments[0].storedPath), 'utf8')).toBe('rascunho')
  expect(existsSync(join(T.ctx.paths.attachments, att.storedPath))).toBe(true)
  expect(getIdea(T.ctx, idea.id)).toMatchObject({ convertedTaskId: task.id, status: 'developing' })
  expect(() => convertIdeaToTask(T.ctx, { id: idea.id, projectId: p.id })).toThrow(expect.objectContaining({ code: 'CONFLICT' }))
})

test('converter em projeto e anexos de ideias na página de arquivos', () => {
  const emp = createCompany(T.ctx, { name: 'Empresa', color: '#0f0' })
  const idea = createIdea(T.ctx, { title: 'Novo SaaS', description: 'para clínicas', status: 'analysis' })
  addAttachments(T.ctx, { ideaId: idea.id, sourcePaths: [tempFile('pitch.pdf', 'x')] })
  const proj = convertIdeaToProject(T.ctx, { id: idea.id, companyId: emp.id, folderId: null })
  expect(proj).toMatchObject({ name: 'Novo SaaS', description: 'para clínicas', companyId: emp.id, color: '#0f0' })
  expect(getIdea(T.ctx, idea.id)).toMatchObject({ convertedProjectId: proj.id, status: 'developing' })
  const files = listAttachments(T.ctx, {})
  expect(files.find((f) => f.originalName === 'pitch.pdf')).toMatchObject({ ideaId: idea.id, ideaTitle: 'Novo SaaS' })
  expect(listAttachments(T.ctx, { companyId: emp.id }).map((f) => f.originalName)).not.toContain('pitch.pdf')
})

test('busca encontra ideias sem acento', () => {
  createIdea(T.ctx, { title: 'Integração com WhatsApp', description: 'notificações' })
  expect(search(T.ctx, { text: 'integracao' }).ideas.map((i) => i.title)).toEqual(['Integração com WhatsApp'])
  expect(search(T.ctx, { text: 'notificacoes' }).ideas).toHaveLength(1)
})
