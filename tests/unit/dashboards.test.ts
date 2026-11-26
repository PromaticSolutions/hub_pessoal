import { createCompany } from '@server/services/companies'
import { createProject } from '@server/services/projects'
import { getBoard } from '@server/services/boards'
import { createTask, setTaskStatus } from '@server/services/tasks'
import { getDashboard } from '@server/services/dashboard'
import { createShoppingItem, setBought } from '@server/services/shopping'
import { createIdea } from '@server/services/ideas'
import { createBlock } from '@server/services/dayBlocks'
import {
  listDashboards, createDashboard, renameDashboard, setDashboardScope, deleteDashboard, getDashboardFull,
  addWidget, updateWidget, removeWidget, saveLayout
} from '@server/services/dashboards'
import { getWidgetData } from '@server/services/widgetData'
import { TEMPLATES } from '@shared/widgets'
import { createTestCtx } from '../helpers/ctx'

let T: Awaited<ReturnType<typeof createTestCtx>>
beforeEach(async () => { T = await createTestCtx(new Date(2026, 10, 25, 12)) })
afterEach(() => T.cleanup())

test('instalação nova cria o dashboard Geral a partir do template', async () => {
  const [geral] = await listDashboards(T.ctx)
  expect(geral).toMatchObject({ name: 'Geral' })
  expect((await getDashboardFull(T.ctx, geral.id)).widgets).toHaveLength(TEMPLATES.geral.widgets.length)
})

test('CRUD de dashboards e blocos', async () => {
  expect((await listDashboards(T.ctx)).map((d) => d.name)).toEqual(['Geral'])
  const fin = await createDashboard(T.ctx, { name: 'Financeiro', template: 'financeiro' })
  expect((await getDashboardFull(T.ctx, fin.id)).widgets.length).toBe(TEMPLATES.financeiro.widgets.length)
  const dup = await createDashboard(T.ctx, { name: 'Cópia', duplicateOf: fin.id })
  expect((await getDashboardFull(T.ctx, dup.id)).widgets.map((w) => w.type)).toEqual((await getDashboardFull(T.ctx, fin.id)).widgets.map((w) => w.type))
  const empty = await createDashboard(T.ctx, { name: 'Vazio', template: 'empty' })
  expect((await getDashboardFull(T.ctx, empty.id)).widgets).toEqual([])
  expect((await renameDashboard(T.ctx, empty.id, 'Meu painel')).name).toBe('Meu painel')
  expect((await setDashboardScope(T.ctx, empty.id, { companyId: 1 })).scope).toEqual({ companyId: 1 })
  const w1 = await addWidget(T.ctx, { dashboardId: empty.id, type: 'kpi', config: { source: { kind: 'inherit' }, metric: 'overdue' } })
  const w2 = await addWidget(T.ctx, { dashboardId: empty.id, type: 'chart' })
  expect(w2.y).toBeGreaterThanOrEqual(w1.y + w1.h)
  expect(await updateWidget(T.ctx, w2.id, { title: 'Pizza', config: { source: { kind: 'inherit' }, chart: 'pie', data: 'byPriority' } })).toMatchObject({ title: 'Pizza', config: { chart: 'pie' } })
  await saveLayout(T.ctx, { dashboardId: empty.id, items: [{ id: w1.id, x: 6, y: 0, w: 3, h: 2 }, { id: w2.id, x: 0, y: 0, w: 6, h: 8 }] })
  expect((await getDashboardFull(T.ctx, empty.id)).widgets.map((w) => [w.id, w.x, w.y, w.w, w.h])).toEqual(expect.arrayContaining([[w1.id, 6, 0, 3, 2], [w2.id, 0, 0, 6, 8]]))
  await removeWidget(T.ctx, w1.id)
  expect((await getDashboardFull(T.ctx, empty.id)).widgets).toHaveLength(1)
  await deleteDashboard(T.ctx, dup.id); await deleteDashboard(T.ctx, fin.id); await deleteDashboard(T.ctx, empty.id)
  const [last] = await listDashboards(T.ctx)
  await expect(deleteDashboard(T.ctx, last.id)).rejects.toMatchObject({ code: 'CONFLICT' })
})

test('dados dos blocos batem com os serviços existentes; fonte herdada e sobrescrita', async () => {
  const emp = await createCompany(T.ctx, { name: 'Empresa', color: '#f00' })
  const p = await createProject(T.ctx, { companyId: emp.id, folderId: null, name: 'P', color: '#000' })
  const pp = await createProject(T.ctx, { companyId: 1, folderId: null, name: 'Pessoal P', color: '#000' })
  const col = async (pid: number) => (await getBoard(T.ctx, ((await T.ctx.db.one('SELECT id FROM boards WHERE project_id = ?', [pid])) as { id: number }).id, {})).columns
  await createTask(T.ctx, { columnId: (await col(p.id))[0].id, title: 'a', dueAt: '2026-11-20', priority: 'urgent' })
  const t2 = await createTask(T.ctx, { columnId: (await col(p.id))[0].id, title: 'b' })
  await setTaskStatus(T.ctx, t2.id, 'done')
  await createTask(T.ctx, { columnId: (await col(pp.id))[0].id, title: 'c', dueAt: '2026-11-27' })
  const v1 = await getDashboard(T.ctx, { scope: 'all' })
  const inherit = { source: { kind: 'inherit' as const } }
  const kpi = async (metric: string, scope: unknown = 'all', config: object = inherit) =>
    await getWidgetData(T.ctx, { widget: { type: 'kpi', config: { ...config, metric } as never }, dashboardScope: scope as never })
  expect(await kpi('total')).toEqual({ kind: 'kpi', value: v1.kpis.total, format: 'int' })
  expect(await kpi('overdue')).toMatchObject({ value: 1 })
  expect(await kpi('total', 'personal')).toMatchObject({ value: 1 })
  expect(await kpi('total', 'personal', { source: { kind: 'scope', scope: { companyId: emp.id } } })).toMatchObject({ value: 2 })
  await createShoppingItem(T.ctx, { name: 'x', quantity: 2, priceCents: 500 })
  const bought = await createShoppingItem(T.ctx, { name: 'y', priceCents: 300 })
  await setBought(T.ctx, bought.id, true)
  expect(await kpi('shoppingPending')).toEqual({ kind: 'kpi', value: 1000, format: 'brl' })
  expect(await kpi('shoppingMonth')).toMatchObject({ value: 300, format: 'brl' })
  await createIdea(T.ctx, { title: 'i' })
  expect(await kpi('ideasNew')).toMatchObject({ value: 1 })
  await createBlock(T.ctx, { date: '2026-11-25', startTime: '09:00', endTime: '10:00', title: 'b' })
  expect(await kpi('dayBlocks')).toMatchObject({ value: 1 })
  const chart = async (data: string) => await getWidgetData(T.ctx, { widget: { type: 'chart', config: { ...inherit, chart: 'bar', data } as never }, dashboardScope: 'all' })
  expect(await chart('byPriority')).toMatchObject({ kind: 'chart', rows: expect.arrayContaining([expect.objectContaining({ label: 'Urgente', value: 1 })]) })
  expect(await chart('byStatus')).toMatchObject({ rows: [{ label: 'A fazer', value: 2 }, { label: 'Em andamento', value: 0 }, { label: 'Em validação', value: 0 }, { label: 'Concluído', value: 1 }] })
  expect((await chart('byCompany') as { rows: unknown[] }).rows).toHaveLength(2)
  expect((await chart('byProject') as unknown as { rows: { label: string }[] }).rows.map((r) => r.label).sort()).toEqual(['P', 'Pessoal P'])
  expect((await chart('createdVsCompleted') as { rows: unknown[] }).rows).toHaveLength(8)
  expect((await chart('shoppingByCategory') as unknown as { rows: { pending: number }[] }).rows[0].pending).toBe(10)
  const list = await getWidgetData(T.ctx, { widget: { type: 'taskList', config: { ...inherit, list: 'overdue' } }, dashboardScope: 'all' })
  expect(list).toMatchObject({ kind: 'taskList', items: [expect.objectContaining({ title: 'a' })] })
  const projects = await getWidgetData(T.ctx, { widget: { type: 'projects', config: inherit }, dashboardScope: 'professional' })
  expect(projects).toMatchObject({ kind: 'projects', items: [expect.objectContaining({ name: 'P', total: 2, done: 1, overdue: 1 })] })
  const shop = await getWidgetData(T.ctx, { widget: { type: 'shopping', config: inherit }, dashboardScope: 'all' })
  expect(shop).toMatchObject({ kind: 'shopping', pendingCents: 1000, items: [expect.objectContaining({ name: 'x' })] })
  const summary = await getWidgetData(T.ctx, { widget: { type: 'summary', config: { ...inherit, metrics: ['total', 'done'] } }, dashboardScope: 'all' })
  expect(summary).toMatchObject({ kind: 'summary', items: [{ metric: 'total', value: 3 }, { metric: 'done', value: 1 }] })
})
