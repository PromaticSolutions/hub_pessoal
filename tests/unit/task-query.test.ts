import { createCompany } from '@server/services/companies'
import { createProject, archiveProject } from '@server/services/projects'
import { getBoard } from '@server/services/boards'
import { createTask, setTaskStatus } from '@server/services/tasks'
import { queryTasks, quickCreateTask, bucketByWeek, getWeekRange } from '@server/services/taskQuery'
import { createLabel } from '@server/services/labels'
import { setTaskLabels } from '@server/services/tasks'
import { getSetting } from '@server/services/settings'
import { createTestCtx } from '../helpers/ctx'

let T: Awaited<ReturnType<typeof createTestCtx>>
beforeEach(async () => { T = await createTestCtx(new Date(2026, 10, 25, 18, 0)) })
afterEach(() => T.cleanup())

async function proj(companyId: number, name = 'P') {
  const p = await createProject(T.ctx, { companyId, folderId: null, name, color: '#000' })
  const boardId = ((await T.ctx.db.one('SELECT id FROM boards WHERE project_id = ?', [p.id])) as { id: number }).id
  return { p, cols: (await getBoard(T.ctx, boardId, {})).columns }
}

test('filtros combinados, escopo e arquivamento herdado', async () => {
  const emp = await createCompany(T.ctx, { name: 'Empresa', color: '#f00' })
  const a = await proj(1, 'Pessoal P')
  const b = await proj(emp.id, 'Emp P')
  await createTask(T.ctx, { columnId: a.cols[0].id, title: 'pessoal', dueAt: '2026-11-26' })
  const t2 = await createTask(T.ctx, { columnId: b.cols[0].id, title: 'urgente emp', priority: 'urgent', dueAt: '2026-11-27' })
  await createTask(T.ctx, { columnId: b.cols[0].id, title: 'baixa emp', priority: 'low', dueAt: '2026-12-20' })
  const q = async (filter: object) => (await queryTasks(T.ctx, { filter, sort: 'due' })).map((t) => t.title)
  expect(await q({ companyIds: [emp.id], priorities: ['urgent'] })).toEqual(['urgente emp'])
  expect(await q({ dueFrom: '2026-11-26', dueTo: '2026-11-30' })).toEqual(['pessoal', 'urgente emp'])
  expect(await q({ scope: 'personal' })).toEqual(['pessoal'])
  expect(await q({ scope: 'professional' })).toEqual(['urgente emp', 'baixa emp'])
  expect(await q({ projectIds: [a.p.id] })).toEqual(['pessoal'])
  const l = await createLabel(T.ctx, { name: 'X', color: '#000' })
  await setTaskLabels(T.ctx, t2.id, [l.id])
  expect(await q({ labelIds: [l.id] })).toEqual(['urgente emp'])
  await archiveProject(T.ctx, b.p.id)
  expect(await q({})).toEqual(['pessoal'])
  expect(await q({ includeArchived: true })).toHaveLength(3)
})

test('ordenação por vencimento com nulos por último e por prioridade', async () => {
  const a = await proj(1)
  await createTask(T.ctx, { columnId: a.cols[0].id, title: 'sem prazo', priority: 'urgent' })
  await createTask(T.ctx, { columnId: a.cols[0].id, title: 'dez', dueAt: '2026-12-01', priority: 'low' })
  await createTask(T.ctx, { columnId: a.cols[0].id, title: 'nov', dueAt: '2026-11-28' })
  expect((await queryTasks(T.ctx, { filter: {}, sort: 'due' })).map((t) => t.title)).toEqual(['nov', 'dez', 'sem prazo'])
  expect((await queryTasks(T.ctx, { filter: {}, sort: 'priority' })).map((t) => t.title)).toEqual(['sem prazo', 'nov', 'dez'])
  expect((await queryTasks(T.ctx, { filter: { noDueOnly: true }, sort: 'due' })).map((t) => t.title)).toEqual(['sem prazo'])
})

test('vencimento só-data hoje: não atrasada até virar o dia, e é "próxima"', async () => {
  const a = await proj(1)
  await createTask(T.ctx, { columnId: a.cols[0].id, title: 'hoje', dueAt: '2026-11-25' })
  let [t] = await queryTasks(T.ctx, { filter: {}, sort: 'due' })
  expect(t).toMatchObject({ isOverdue: false, isNearDue: true })
  expect(await queryTasks(T.ctx, { filter: { overdueOnly: true }, sort: 'due' })).toHaveLength(0)
  T.setNow(new Date(2026, 10, 26, 0, 1))
  ;[t] = await queryTasks(T.ctx, { filter: {}, sort: 'due' })
  expect(t).toMatchObject({ isOverdue: true, isNearDue: false })
  expect(await queryTasks(T.ctx, { filter: { overdueOnly: true }, sort: 'due' })).toHaveLength(1)
})

test('includeDone false oculta concluídas', async () => {
  const a = await proj(1)
  const t = await createTask(T.ctx, { columnId: a.cols[0].id, title: 'x' })
  await setTaskStatus(T.ctx, t.id, 'done')
  expect(await queryTasks(T.ctx, { filter: { includeDone: false }, sort: 'due' })).toHaveLength(0)
  expect((await queryTasks(T.ctx, { filter: {}, sort: 'due' }))[0]).toMatchObject({ status: 'done', isPersonal: true, projectName: 'P', companyName: 'Pessoal' })
})

test('getWeekRange começa na segunda e bucketByWeek ordena e separa atrasadas', async () => {
  const w = getWeekRange(new Date(2026, 10, 25), 1)
  expect(w).toEqual({ start: '2026-11-23', end: '2026-11-29', days: ['2026-11-23', '2026-11-24', '2026-11-25', '2026-11-26', '2026-11-27', '2026-11-28', '2026-11-29'] })
  expect(getWeekRange(new Date(2026, 10, 25), 0).start).toBe('2026-11-22')
  const a = await proj(1)
  await createTask(T.ctx, { columnId: a.cols[0].id, title: 'atrasada', dueAt: '2026-11-20' })
  await createTask(T.ctx, { columnId: a.cols[0].id, title: 'baixa', dueAt: '2026-11-26', priority: 'low' })
  await createTask(T.ctx, { columnId: a.cols[0].id, title: 'urgente 10h', dueAt: '2026-11-26T10:00', priority: 'urgent' })
  await createTask(T.ctx, { columnId: a.cols[0].id, title: 'urgente dia', dueAt: '2026-11-26', priority: 'urgent' })
  const b = bucketByWeek(await queryTasks(T.ctx, { filter: {}, sort: 'due' }), w.days, T.ctx.now())
  expect(b.overdue.map((t) => t.title)).toEqual(['atrasada'])
  expect(b.byDay['2026-11-26'].map((t) => t.title)).toEqual(['urgente dia', 'urgente 10h', 'baixa'])
})

test('quickCreate cria na primeira coluna A fazer e grava lastProjectId; sem quadro cria um', async () => {
  const a = await proj(1)
  const t = await quickCreateTask(T.ctx, { projectId: a.p.id, title: 'rápida', dueAt: '2026-11-30' })
  expect(t.columnId).toBe(a.cols[0].id)
  expect(await getSetting(T.ctx.db, 'lastProjectId', null)).toBe(a.p.id)
  await T.ctx.db.run('DELETE FROM boards WHERE project_id = ?', [a.p.id])
  const t2 = await quickCreateTask(T.ctx, { projectId: a.p.id, title: 'sem quadro' })
  expect(t2.boardId).toBeGreaterThan(0)
})
