import { createCompany } from '@server/services/companies'
import { createProject } from '@server/services/projects'
import { getBoard } from '@server/services/boards'
import { createTask } from '@server/services/tasks'
import { getCalendarItems } from '@server/services/calendar'
import { monthGrid, groupItemsByDay, splitTimed } from '@shared/calendar'
import { createTestCtx } from '../helpers/ctx'

let T: Awaited<ReturnType<typeof createTestCtx>>
beforeEach(async () => { T = await createTestCtx(new Date(2026, 10, 25, 12)) })
afterEach(() => T.cleanup())

async function cols(companyId = 1) {
  const p = await createProject(T.ctx, { companyId, folderId: null, name: 'P', color: '#000' })
  const boardId = ((await T.ctx.db.one('SELECT id FROM boards WHERE project_id = ?', [p.id])) as { id: number }).id
  return (await getBoard(T.ctx, boardId, {})).columns
}

test('itens de vencimento e início no intervalo; sem datas não aparece; filtro por empresa', async () => {
  const c = await cols()
  const emp = await createCompany(T.ctx, { name: 'E', color: '#f00' })
  const c2 = await cols(emp.id)
  await createTask(T.ctx, { columnId: c[0].id, title: 'ambos', startAt: '2026-11-02', dueAt: '2026-11-10T14:30' })
  await createTask(T.ctx, { columnId: c[0].id, title: 'sem datas' })
  await createTask(T.ctx, { columnId: c[0].id, title: 'fora', dueAt: '2026-12-10' })
  await createTask(T.ctx, { columnId: c2[0].id, title: 'empresa', dueAt: '2026-11-15' })
  const items = await getCalendarItems(T.ctx, { from: '2026-11-01', to: '2026-11-30', filter: {} })
  expect(items.map((i) => `${i.kind}:${i.task.title}:${i.date}:${i.time}`).sort()).toEqual([
    'due:ambos:2026-11-10:14:30',
    'due:empresa:2026-11-15:null',
    'start:ambos:2026-11-02:null'
  ])
  expect((await getCalendarItems(T.ctx, { from: '2026-11-01', to: '2026-11-30', filter: { companyIds: [emp.id] } })).map((i) => i.task.title)).toEqual(['empresa'])
})

test('monthGrid de novembro/2026 começa em 26/10 (segunda) e tem 42 dias', async () => {
  const g = monthGrid(new Date(2026, 10, 15), 1)
  expect(g).toHaveLength(6)
  expect(g[0][0]).toBe('2026-10-26')
  expect(g.flat()).toHaveLength(42)
  expect(g[5][6]).toBe('2026-12-06')
})

test('groupItemsByDay ordena dia-inteiro antes de horários, depois prioridade', async () => {
  const mk = (title: string, date: string, time: string | null, priority: 'low' | 'urgent') =>
    ({ kind: 'due' as const, date, time, task: { title, priority } as never })
  const g = groupItemsByDay([mk('10h', '2026-11-10', '10:00', 'urgent'), mk('dia baixa', '2026-11-10', null, 'low'), mk('dia urgente', '2026-11-10', null, 'urgent'), mk('08h', '2026-11-10', '08:00', 'low')])
  expect(g['2026-11-10'].map((i) => (i.task as { title: string }).title)).toEqual(['dia urgente', 'dia baixa', '08h', '10h'])
  const s = splitTimed(g['2026-11-10'])
  expect(s.allDay).toHaveLength(2)
  expect(s.timed).toHaveLength(2)
})
