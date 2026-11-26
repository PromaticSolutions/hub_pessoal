import { createCompany } from '@server/services/companies'
import { createProject, archiveProject, updateProject } from '@server/services/projects'
import { getBoard } from '@server/services/boards'
import { createTask, setTaskStatus } from '@server/services/tasks'
import { getDashboard } from '@server/services/dashboard'
import { createTestCtx } from '../helpers/ctx'

let T: Awaited<ReturnType<typeof createTestCtx>>
beforeEach(async () => { T = await createTestCtx(new Date(2026, 10, 25, 12, 0)) }) // quarta 25/11/2026
afterEach(() => T.cleanup())

async function proj(companyId: number) {
  const p = await createProject(T.ctx, { companyId, folderId: null, name: 'P', color: '#000' })
  const boardId = ((await T.ctx.db.one('SELECT id FROM boards WHERE project_id = ?', [p.id])) as { id: number }).id
  return { p, cols: (await getBoard(T.ctx, boardId, {})).columns }
}

async function seed() {
  const a = await createCompany(T.ctx, { name: 'A', color: '#f00' })
  const b = await createCompany(T.ctx, { name: 'B', color: '#0f0' })
  const pa = await proj(a.id)
  const pb = await proj(b.id)
  const pp = await proj(1)
  const mk = async (cols: typeof pa.cols, title: string, o: { col?: number; due?: string; prio?: 'low' | 'medium' | 'high' | 'urgent' } = {}) =>
    await createTask(T.ctx, { columnId: cols[o.col ?? 0].id, title, dueAt: o.due ?? null, priority: o.prio })
  await mk(pa.cols, 'a1', { due: '2026-11-20', prio: 'urgent' }) // atrasada
  await mk(pa.cols, 'a2', { due: '2026-11-28', prio: 'high' }) // próxima
  await mk(pa.cols, 'a3', { col: 2, prio: 'high' }) // em andamento
  const done = await mk(pa.cols, 'a4', { due: '2026-11-10' })
  await setTaskStatus(T.ctx, done.id, 'done')
  await mk(pb.cols, 'b1', { due: '2026-11-25', prio: 'low' }) // hoje: próxima, não atrasada
  await mk(pb.cols, 'b2', { col: 3 }) // em revisão (in_progress)
  await mk(pp.cols, 'p1', { due: '2026-12-20' })
  const arch = await proj(a.id)
  await mk(arch.cols, 'arq', { due: '2026-11-01' })
  await archiveProject(T.ctx, arch.p.id)
  await updateProject(T.ctx, pb.p.id, { status: 'paused' })
  return { a, b, pa, pb, pp }
}

test('KPIs exatos ignorando projeto arquivado', async () => {
  await seed()
  const d = await getDashboard(T.ctx, { scope: 'all' })
  expect(d.kpis).toEqual({ total: 7, todo: 4, inProgress: 2, done: 1, overdue: 1, nearDue: 2, activeProjects: 2, companies: 2 })
  expect(d.byPriority).toEqual([
    { priority: 'urgent', count: 1 },
    { priority: 'high', count: 2 },
    { priority: 'medium', count: 2 },
    { priority: 'low', count: 1 }
  ])
  expect(d.overdueList.map((t) => t.title)).toEqual(['a1'])
  expect(d.nearDueList.map((t) => t.title)).toEqual(['b1', 'a2'])
})

test('carga por espaço só conta abertas', async () => {
  const s = await seed()
  const d = await getDashboard(T.ctx, { scope: 'all' })
  expect(d.byCompany.find((c) => c.companyId === s.a.id)).toMatchObject({ name: 'A', urgent: 1, high: 2, medium: 0, low: 0 })
  expect(d.byCompany.find((c) => c.companyId === 1)).toMatchObject({ medium: 1 })
})

test('8 semanas com zeros; concluídas contadas na semana certa', async () => {
  await seed()
  const d = await getDashboard(T.ctx, { scope: 'all' })
  expect(d.completedPerWeek).toHaveLength(8)
  expect(d.completedPerWeek.at(-1)).toEqual({ weekStart: '2026-11-23', count: 1 })
  expect(d.completedPerWeek[0].weekStart).toBe('2026-10-05')
  expect(d.createdVsCompleted.at(-1)).toMatchObject({ weekStart: '2026-11-23', completed: 1 })
  expect(d.createdVsCompleted.at(-1)!.created).toBe(7)
})

test('escopos: profissional, empresa e projeto', async () => {
  const s = await seed()
  expect((await getDashboard(T.ctx, { scope: 'professional' })).kpis.total).toBe(6)
  expect((await getDashboard(T.ctx, { scope: 'personal' })).kpis.total).toBe(1)
  expect((await getDashboard(T.ctx, { scope: { companyId: s.b.id } })).kpis).toMatchObject({ total: 2, inProgress: 1, activeProjects: 0 })
  expect((await getDashboard(T.ctx, { scope: { projectId: s.pa.p.id } })).kpis).toMatchObject({ total: 4, done: 1, overdue: 1 })
})
