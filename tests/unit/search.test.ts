import { createProject, archiveProject } from '@main/services/projects'
import { getBoard } from '@main/services/boards'
import { createTask, setTaskLabels } from '@main/services/tasks'
import { addComment } from '@main/services/comments'
import { createLabel } from '@main/services/labels'
import { search, buildFtsQuery } from '@main/services/search'
import { createTestCtx } from '../helpers/ctx'

let T: ReturnType<typeof createTestCtx>
beforeEach(() => { T = createTestCtx() })
afterEach(() => T.cleanup())

function setup(name = 'Projeto') {
  const p = createProject(T.ctx, { companyId: 1, folderId: null, name, color: '#000' })
  const boardId = (T.ctx.db.prepare('SELECT id FROM boards WHERE project_id = ?').get(p.id) as { id: number }).id
  return { p, cols: getBoard(T.ctx, boardId, {}).columns }
}

test('sem acento encontra com acento; prefixo funciona', () => {
  const { cols } = setup()
  createTask(T.ctx, { columnId: cols[0].id, title: 'Orçamento anual' })
  createTask(T.ctx, { columnId: cols[0].id, title: 'Outro', description: 'enviar relatório' })
  expect(search(T.ctx, { text: 'orcamento' }).tasks.map((t) => t.title)).toEqual(['Orçamento anual'])
  expect(search(T.ctx, { text: 'relat' }).tasks.map((t) => t.title)).toEqual(['Outro'])
  expect(search(T.ctx, { text: 'relat' }).tasks[0].snippet).toContain('«')
})

test('palavra só em comentário retorna o comentário com taskId', () => {
  const { cols } = setup()
  const t = createTask(T.ctx, { columnId: cols[0].id, title: 'Revisar contrato' })
  addComment(T.ctx, { taskId: t.id, body: 'assinatura pendente' })
  const r = search(T.ctx, { text: 'assinatura' })
  expect(r.comments).toMatchObject([{ taskId: t.id, taskTitle: 'Revisar contrato' }])
  expect(r.tasks).toEqual([])
})

test('projetos e empresas aparecem; filtros por prioridade e etiqueta; arquivados só com flag', () => {
  const { p, cols } = setup('Projeto Alfa')
  const a = createTask(T.ctx, { columnId: cols[0].id, title: 'alfa urgente', priority: 'urgent' })
  createTask(T.ctx, { columnId: cols[0].id, title: 'alfa baixa', priority: 'low' })
  expect(search(T.ctx, { text: 'alfa' }).projects.map((x) => x.name)).toEqual(['Projeto Alfa'])
  expect(search(T.ctx, { text: 'pessoal' }).companies.map((x) => x.name)).toEqual(['Pessoal'])
  expect(search(T.ctx, { text: 'alfa', filter: { priorities: ['urgent'] } }).tasks.map((t) => t.title)).toEqual(['alfa urgente'])
  const l = createLabel(T.ctx, { name: 'X', color: '#000' })
  setTaskLabels(T.ctx, a.id, [l.id])
  expect(search(T.ctx, { text: 'alfa', filter: { labelIds: [l.id] } }).tasks.map((t) => t.title)).toEqual(['alfa urgente'])
  archiveProject(T.ctx, p.id)
  expect(search(T.ctx, { text: 'alfa' }).tasks).toEqual([])
  expect(search(T.ctx, { text: 'alfa', filter: { includeArchived: true } }).tasks).toHaveLength(2)
})

test('sintaxe FTS no texto nunca lança erro', () => {
  const { cols } = setup()
  createTask(T.ctx, { columnId: cols[0].id, title: 'foo bar' })
  for (const q of ['"foo* OR -bar', 'NEAR(', 'a:b', '***', "it's", 'AND', '(', '^foo']) {
    expect(() => search(T.ctx, { text: q })).not.toThrow()
  }
  expect(buildFtsQuery('  ')).toBeNull()
  expect(buildFtsQuery('foo "bar')).toBe('"foo"* "bar"*')
})

test('desempenho: 5.000 tarefas, busca de 1 palavra < 100 ms', () => {
  const { cols } = setup()
  const ins = T.ctx.db.prepare('INSERT INTO tasks(board_id, column_id, title, description, position) VALUES (?, ?, ?, ?, ?)')
  T.ctx.db.transaction(() => {
    for (let i = 0; i < 5000; i++) ins.run(cols[0].boardId, cols[0].id, `Tarefa número ${i} ${i % 50 === 0 ? 'especial' : 'comum'}`, 'descrição qualquer de teste', i)
  })()
  search(T.ctx, { text: 'especial' })
  const t0 = performance.now()
  for (let i = 0; i < 5; i++) search(T.ctx, { text: 'especial' })
  const avg = (performance.now() - t0) / 5
  expect(avg).toBeLessThan(100)
})
