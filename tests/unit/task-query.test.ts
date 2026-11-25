import { createCompany } from '@main/services/companies'
import { createProject, archiveProject } from '@main/services/projects'
import { getBoard } from '@main/services/boards'
import { createTask, setTaskStatus } from '@main/services/tasks'
import { queryTasks, quickCreateTask, bucketByWeek, getWeekRange } from '@main/services/taskQuery'
import { createLabel } from '@main/services/labels'
import { setTaskLabels } from '@main/services/tasks'
import { getSetting } from '@main/services/settings'
import { createTestCtx } from '../helpers/ctx'

let T: ReturnType<typeof createTestCtx>
beforeEach(() => { T = createTestCtx(new Date(2026, 10, 25, 18, 0)) })
afterEach(() => T.cleanup())

function proj(companyId: number, name = 'P') {
  const p = createProject(T.ctx, { companyId, folderId: null, name, color: '#000' })
  const boardId = (T.ctx.db.prepare('SELECT id FROM boards WHERE project_id = ?').get(p.id) as { id: number }).id
  return { p, cols: getBoard(T.ctx, boardId, {}).columns }
}

test('filtros combinados, escopo e arquivamento herdado', () => {
  const emp = createCompany(T.ctx, { name: 'Empresa', color: '#f00' })
  const a = proj(1, 'Pessoal P')
  const b = proj(emp.id, 'Emp P')
  createTask(T.ctx, { columnId: a.cols[0].id, title: 'pessoal', dueAt: '2026-11-26' })
  const t2 = createTask(T.ctx, { columnId: b.cols[0].id, title: 'urgente emp', priority: 'urgent', dueAt: '2026-11-27' })
  createTask(T.ctx, { columnId: b.cols[0].id, title: 'baixa emp', priority: 'low', dueAt: '2026-12-20' })
  const q = (filter: object) => queryTasks(T.ctx, { filter, sort: 'due' }).map((t) => t.title)
  expect(q({ companyIds: [emp.id], priorities: ['urgent'] })).toEqual(['urgente emp'])
  expect(q({ dueFrom: '2026-11-26', dueTo: '2026-11-30' })).toEqual(['pessoal', 'urgente emp'])
  expect(q({ scope: 'personal' })).toEqual(['pessoal'])
  expect(q({ scope: 'professional' })).toEqual(['urgente emp', 'baixa emp'])
  expect(q({ projectIds: [a.p.id] })).toEqual(['pessoal'])
  const l = createLabel(T.ctx, { name: 'X', color: '#000' })
  setTaskLabels(T.ctx, t2.id, [l.id])
  expect(q({ labelIds: [l.id] })).toEqual(['urgente emp'])
  archiveProject(T.ctx, b.p.id)
  expect(q({})).toEqual(['pessoal'])
  expect(q({ includeArchived: true })).toHaveLength(3)
})

test('ordenação por vencimento com nulos por último e por prioridade', () => {
  const a = proj(1)
  createTask(T.ctx, { columnId: a.cols[0].id, title: 'sem prazo', priority: 'urgent' })
  createTask(T.ctx, { columnId: a.cols[0].id, title: 'dez', dueAt: '2026-12-01', priority: 'low' })
  createTask(T.ctx, { columnId: a.cols[0].id, title: 'nov', dueAt: '2026-11-28' })
  expect(queryTasks(T.ctx, { filter: {}, sort: 'due' }).map((t) => t.title)).toEqual(['nov', 'dez', 'sem prazo'])
  expect(queryTasks(T.ctx, { filter: {}, sort: 'priority' }).map((t) => t.title)).toEqual(['sem prazo', 'nov', 'dez'])
  expect(queryTasks(T.ctx, { filter: { noDueOnly: true }, sort: 'due' }).map((t) => t.title)).toEqual(['sem prazo'])
})

test('vencimento só-data hoje: não atrasada até virar o dia, e é "próxima"', () => {
  const a = proj(1)
  createTask(T.ctx, { columnId: a.cols[0].id, title: 'hoje', dueAt: '2026-11-25' })
  let [t] = queryTasks(T.ctx, { filter: {}, sort: 'due' })
  expect(t).toMatchObject({ isOverdue: false, isNearDue: true })
  expect(queryTasks(T.ctx, { filter: { overdueOnly: true }, sort: 'due' })).toHaveLength(0)
  T.setNow(new Date(2026, 10, 26, 0, 1))
  ;[t] = queryTasks(T.ctx, { filter: {}, sort: 'due' })
  expect(t).toMatchObject({ isOverdue: true, isNearDue: false })
  expect(queryTasks(T.ctx, { filter: { overdueOnly: true }, sort: 'due' })).toHaveLength(1)
})

test('includeDone false oculta concluídas', () => {
  const a = proj(1)
  const t = createTask(T.ctx, { columnId: a.cols[0].id, title: 'x' })
  setTaskStatus(T.ctx, t.id, 'done')
  expect(queryTasks(T.ctx, { filter: { includeDone: false }, sort: 'due' })).toHaveLength(0)
  expect(queryTasks(T.ctx, { filter: {}, sort: 'due' })[0]).toMatchObject({ status: 'done', isPersonal: true, projectName: 'P', companyName: 'Pessoal' })
})

test('getWeekRange começa na segunda e bucketByWeek ordena e separa atrasadas', () => {
  const w = getWeekRange(new Date(2026, 10, 25), 1)
  expect(w).toEqual({ start: '2026-11-23', end: '2026-11-29', days: ['2026-11-23', '2026-11-24', '2026-11-25', '2026-11-26', '2026-11-27', '2026-11-28', '2026-11-29'] })
  expect(getWeekRange(new Date(2026, 10, 25), 0).start).toBe('2026-11-22')
  const a = proj(1)
  createTask(T.ctx, { columnId: a.cols[0].id, title: 'atrasada', dueAt: '2026-11-20' })
  createTask(T.ctx, { columnId: a.cols[0].id, title: 'baixa', dueAt: '2026-11-26', priority: 'low' })
  createTask(T.ctx, { columnId: a.cols[0].id, title: 'urgente 10h', dueAt: '2026-11-26T10:00', priority: 'urgent' })
  createTask(T.ctx, { columnId: a.cols[0].id, title: 'urgente dia', dueAt: '2026-11-26', priority: 'urgent' })
  const b = bucketByWeek(queryTasks(T.ctx, { filter: {}, sort: 'due' }), w.days, T.ctx.now())
  expect(b.overdue.map((t) => t.title)).toEqual(['atrasada'])
  expect(b.byDay['2026-11-26'].map((t) => t.title)).toEqual(['urgente dia', 'urgente 10h', 'baixa'])
})

test('quickCreate cria na primeira coluna A fazer e grava lastProjectId; sem quadro cria um', () => {
  const a = proj(1)
  const t = quickCreateTask(T.ctx, { projectId: a.p.id, title: 'rápida', dueAt: '2026-11-30' })
  expect(t.columnId).toBe(a.cols[0].id)
  expect(getSetting(T.ctx.db, 'lastProjectId', null)).toBe(a.p.id)
  T.ctx.db.prepare('DELETE FROM boards WHERE project_id = ?').run(a.p.id)
  const t2 = quickCreateTask(T.ctx, { projectId: a.p.id, title: 'sem quadro' })
  expect(t2.boardId).toBeGreaterThan(0)
})
