import { createProject, archiveProject } from '@server/services/projects'
import { getBoard } from '@server/services/boards'
import { createTask, setTaskLabels } from '@server/services/tasks'
import { addComment } from '@server/services/comments'
import { createLabel } from '@server/services/labels'
import { search, buildSearchTerms } from '@server/services/search'
import { createTestCtx } from '../helpers/ctx'

let T: Awaited<ReturnType<typeof createTestCtx>>
beforeEach(async () => { T = await createTestCtx() })
afterEach(() => T.cleanup())

async function setup(name = 'Projeto') {
  const p = await createProject(T.ctx, { companyId: 1, folderId: null, name, color: '#000' })
  const boardId = ((await T.ctx.db.one('SELECT id FROM boards WHERE project_id = ?', [p.id])) as { id: number }).id
  return { p, cols: (await getBoard(T.ctx, boardId, {})).columns }
}

test('sem acento encontra com acento; prefixo funciona', async () => {
  const { cols } = await setup()
  await createTask(T.ctx, { columnId: cols[0].id, title: 'Orçamento anual' })
  await createTask(T.ctx, { columnId: cols[0].id, title: 'Outro', description: 'enviar relatório' })
  expect((await search(T.ctx, { text: 'orcamento' })).tasks.map((t) => t.title)).toEqual(['Orçamento anual'])
  expect((await search(T.ctx, { text: 'relat' })).tasks.map((t) => t.title)).toEqual(['Outro'])
  expect((await search(T.ctx, { text: 'relat' })).tasks[0].snippet).toContain('«')
})

test('palavra só em comentário retorna o comentário com taskId', async () => {
  const { cols } = await setup()
  const t = await createTask(T.ctx, { columnId: cols[0].id, title: 'Revisar contrato' })
  await addComment(T.ctx, { taskId: t.id, body: 'assinatura pendente' })
  const r = await search(T.ctx, { text: 'assinatura' })
  expect(r.comments).toMatchObject([{ taskId: t.id, taskTitle: 'Revisar contrato' }])
  expect(r.tasks).toEqual([])
})

test('projetos e empresas aparecem; filtros por prioridade e etiqueta; arquivados só com flag', async () => {
  const { p, cols } = await setup('Projeto Alfa')
  const a = await createTask(T.ctx, { columnId: cols[0].id, title: 'alfa urgente', priority: 'urgent' })
  await createTask(T.ctx, { columnId: cols[0].id, title: 'alfa baixa', priority: 'low' })
  expect((await search(T.ctx, { text: 'alfa' })).projects.map((x) => x.name)).toEqual(['Projeto Alfa'])
  expect((await search(T.ctx, { text: 'pessoal' })).companies.map((x) => x.name)).toEqual(['Pessoal'])
  expect((await search(T.ctx, { text: 'alfa', filter: { priorities: ['urgent'] } })).tasks.map((t) => t.title)).toEqual(['alfa urgente'])
  const l = await createLabel(T.ctx, { name: 'X', color: '#000' })
  await setTaskLabels(T.ctx, a.id, [l.id])
  expect((await search(T.ctx, { text: 'alfa', filter: { labelIds: [l.id] } })).tasks.map((t) => t.title)).toEqual(['alfa urgente'])
  await archiveProject(T.ctx, p.id)
  expect((await search(T.ctx, { text: 'alfa' })).tasks).toEqual([])
  expect((await search(T.ctx, { text: 'alfa', filter: { includeArchived: true } })).tasks).toHaveLength(2)
})

test('sintaxe FTS no texto nunca lança erro', async () => {
  const { cols } = await setup()
  await createTask(T.ctx, { columnId: cols[0].id, title: 'foo bar' })
  for (const q of ['"foo* OR -bar', 'NEAR(', 'a:b', '***', "it's", 'AND', '(', '^foo']) {
    await expect(search(T.ctx, { text: q })).resolves.toBeDefined()
  }
  expect(buildSearchTerms('  ')).toEqual([])
  expect(buildSearchTerms('foo "bar')).toEqual(['foo', 'bar'])
  expect(buildSearchTerms('50% a_b')).toEqual(['50\\%', 'a\\_b'])
})

test('desempenho: 5.000 tarefas, busca de 1 palavra < 100 ms', async () => {
  const { cols } = await setup()
  await T.ctx.db.run(
    `INSERT INTO tasks(board_id, column_id, title, description, position)
     SELECT ?, ?, 'Tarefa número ' || i || CASE WHEN i % 50 = 0 THEN ' especial' ELSE ' comum' END, 'descrição qualquer de teste', i
     FROM generate_series(0, 4999) i`,
    [cols[0].boardId, cols[0].id]
  )
  await search(T.ctx, { text: 'especial' })
  const t0 = performance.now()
  for (let i = 0; i < 5; i++) await search(T.ctx, { text: 'especial' })
  const avg = (performance.now() - t0) / 5
  expect(avg).toBeLessThan(100)
})

test('busca sem acento e com maiúsculas', async () => {
  const { cols } = await setup()
  const t = await createTask(T.ctx, { columnId: cols[0].id, title: 'Ação no cliente' })
  await addComment(T.ctx, { taskId: t.id, body: 'reunião AMANHÃ' })
  expect((await search(T.ctx, { text: 'acao' })).tasks.map((x) => x.id)).toEqual([t.id])
  expect((await search(T.ctx, { text: 'AÇÃO' })).tasks.map((x) => x.id)).toEqual([t.id])
  expect((await search(T.ctx, { text: 'reuniao amanha' })).comments.map((x) => x.taskId)).toEqual([t.id])
  const none = await search(T.ctx, { text: 'acao amanha' })
  expect([...none.tasks, ...none.comments]).toEqual([])
  await expect(search(T.ctx, { text: '50%' })).resolves.toBeDefined()
})
