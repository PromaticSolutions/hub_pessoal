import { createCompany } from '@main/services/companies'
import { createProject, archiveProject, updateProject } from '@main/services/projects'
import { getBoard } from '@main/services/boards'
import { createTask, setTaskStatus } from '@main/services/tasks'
import { getDashboard } from '@main/services/dashboard'
import { createTestCtx } from '../helpers/ctx'

let T: ReturnType<typeof createTestCtx>
beforeEach(() => { T = createTestCtx(new Date(2026, 10, 25, 12, 0)) }) // quarta 25/11/2026
afterEach(() => T.cleanup())

function proj(companyId: number) {
  const p = createProject(T.ctx, { companyId, folderId: null, name: 'P', color: '#000' })
  const boardId = (T.ctx.db.prepare('SELECT id FROM boards WHERE project_id = ?').get(p.id) as { id: number }).id
  return { p, cols: getBoard(T.ctx, boardId, {}).columns }
}

function seed() {
  const a = createCompany(T.ctx, { name: 'A', color: '#f00' })
  const b = createCompany(T.ctx, { name: 'B', color: '#0f0' })
  const pa = proj(a.id)
  const pb = proj(b.id)
  const pp = proj(1)
  const mk = (cols: typeof pa.cols, title: string, o: { col?: number; due?: string; prio?: 'low' | 'medium' | 'high' | 'urgent' } = {}) =>
    createTask(T.ctx, { columnId: cols[o.col ?? 0].id, title, dueAt: o.due ?? null, priority: o.prio })
  mk(pa.cols, 'a1', { due: '2026-11-20', prio: 'urgent' }) // atrasada
  mk(pa.cols, 'a2', { due: '2026-11-28', prio: 'high' }) // próxima
  mk(pa.cols, 'a3', { col: 2, prio: 'high' }) // em andamento
  const done = mk(pa.cols, 'a4', { due: '2026-11-10' })
  setTaskStatus(T.ctx, done.id, 'done')
  mk(pb.cols, 'b1', { due: '2026-11-25', prio: 'low' }) // hoje: próxima, não atrasada
  mk(pb.cols, 'b2', { col: 3 }) // em revisão (in_progress)
  mk(pp.cols, 'p1', { due: '2026-12-20' })
  const arch = proj(a.id)
  mk(arch.cols, 'arq', { due: '2026-11-01' })
  archiveProject(T.ctx, arch.p.id)
  updateProject(T.ctx, pb.p.id, { status: 'paused' })
  return { a, b, pa, pb, pp }
}

test('KPIs exatos ignorando projeto arquivado', () => {
  seed()
  const d = getDashboard(T.ctx, { scope: 'all' })
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

test('carga por espaço só conta abertas', () => {
  const s = seed()
  const d = getDashboard(T.ctx, { scope: 'all' })
  expect(d.byCompany.find((c) => c.companyId === s.a.id)).toMatchObject({ name: 'A', urgent: 1, high: 2, medium: 0, low: 0 })
  expect(d.byCompany.find((c) => c.companyId === 1)).toMatchObject({ medium: 1 })
})

test('8 semanas com zeros; concluídas contadas na semana certa', () => {
  seed()
  const d = getDashboard(T.ctx, { scope: 'all' })
  expect(d.completedPerWeek).toHaveLength(8)
  expect(d.completedPerWeek.at(-1)).toEqual({ weekStart: '2026-11-23', count: 1 })
  expect(d.completedPerWeek[0].weekStart).toBe('2026-10-05')
  expect(d.createdVsCompleted.at(-1)).toMatchObject({ weekStart: '2026-11-23', completed: 1 })
  expect(d.createdVsCompleted.at(-1)!.created).toBe(7)
})

test('escopos: profissional, empresa e projeto', () => {
  const s = seed()
  expect(getDashboard(T.ctx, { scope: 'professional' }).kpis.total).toBe(6)
  expect(getDashboard(T.ctx, { scope: 'personal' }).kpis.total).toBe(1)
  expect(getDashboard(T.ctx, { scope: { companyId: s.b.id } }).kpis).toMatchObject({ total: 2, inProgress: 1, activeProjects: 0 })
  expect(getDashboard(T.ctx, { scope: { projectId: s.pa.p.id } }).kpis).toMatchObject({ total: 4, done: 1, overdue: 1 })
})
