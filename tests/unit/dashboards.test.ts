import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openDatabase } from '@main/db/connection'
import { runMigrations } from '@main/db/migrate'
import { migrations } from '@main/db/migrations'
import { createCompany } from '@main/services/companies'
import { createProject } from '@main/services/projects'
import { getBoard } from '@main/services/boards'
import { createTask, setTaskStatus } from '@main/services/tasks'
import { getDashboard } from '@main/services/dashboard'
import { createShoppingItem, setBought } from '@main/services/shopping'
import { createIdea } from '@main/services/ideas'
import { createBlock } from '@main/services/dayBlocks'
import {
  listDashboards, createDashboard, renameDashboard, setDashboardScope, deleteDashboard, getDashboardFull,
  addWidget, updateWidget, removeWidget, saveLayout
} from '@main/services/dashboards'
import { getWidgetData } from '@main/services/widgetData'
import { TEMPLATES } from '@shared/widgets'
import { createTestCtx } from '../helpers/ctx'

let T: ReturnType<typeof createTestCtx>
beforeEach(() => { T = createTestCtx(new Date(2026, 10, 25, 12)) })
afterEach(() => T.cleanup())

test('migração 007 cria o dashboard Geral a partir do template e herda o escopo salvo da v1', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pth-mig7-'))
  const db = openDatabase(join(dir, 'hub.db'))
  runMigrations(db, { migrations: migrations.filter((m) => m.version <= 6) })
  db.prepare("INSERT INTO settings(key, value) VALUES ('dashboard.scope', ?)").run(JSON.stringify('professional'))
  runMigrations(db, {})
  const ds = db.prepare('SELECT * FROM dashboards').all() as { name: string; scope: string }[]
  expect(ds).toHaveLength(1)
  expect(ds[0]).toMatchObject({ name: 'Geral', scope: '"professional"' })
  const n = (db.prepare('SELECT count(*) n FROM dashboard_widgets').get() as { n: number }).n
  expect(n).toBe(TEMPLATES.geral.widgets.length)
  db.close()
})

test('CRUD de dashboards e blocos', () => {
  expect(listDashboards(T.ctx).map((d) => d.name)).toEqual(['Geral'])
  const fin = createDashboard(T.ctx, { name: 'Financeiro', template: 'financeiro' })
  expect(getDashboardFull(T.ctx, fin.id).widgets.length).toBe(TEMPLATES.financeiro.widgets.length)
  const dup = createDashboard(T.ctx, { name: 'Cópia', duplicateOf: fin.id })
  expect(getDashboardFull(T.ctx, dup.id).widgets.map((w) => w.type)).toEqual(getDashboardFull(T.ctx, fin.id).widgets.map((w) => w.type))
  const empty = createDashboard(T.ctx, { name: 'Vazio', template: 'empty' })
  expect(getDashboardFull(T.ctx, empty.id).widgets).toEqual([])
  expect(renameDashboard(T.ctx, empty.id, 'Meu painel').name).toBe('Meu painel')
  expect(setDashboardScope(T.ctx, empty.id, { companyId: 1 }).scope).toEqual({ companyId: 1 })
  const w1 = addWidget(T.ctx, { dashboardId: empty.id, type: 'kpi', config: { source: { kind: 'inherit' }, metric: 'overdue' } })
  const w2 = addWidget(T.ctx, { dashboardId: empty.id, type: 'chart' })
  expect(w2.y).toBeGreaterThanOrEqual(w1.y + w1.h)
  expect(updateWidget(T.ctx, w2.id, { title: 'Pizza', config: { source: { kind: 'inherit' }, chart: 'pie', data: 'byPriority' } })).toMatchObject({ title: 'Pizza', config: { chart: 'pie' } })
  saveLayout(T.ctx, { dashboardId: empty.id, items: [{ id: w1.id, x: 6, y: 0, w: 3, h: 2 }, { id: w2.id, x: 0, y: 0, w: 6, h: 8 }] })
  expect(getDashboardFull(T.ctx, empty.id).widgets.map((w) => [w.id, w.x, w.y, w.w, w.h])).toEqual(expect.arrayContaining([[w1.id, 6, 0, 3, 2], [w2.id, 0, 0, 6, 8]]))
  removeWidget(T.ctx, w1.id)
  expect(getDashboardFull(T.ctx, empty.id).widgets).toHaveLength(1)
  deleteDashboard(T.ctx, dup.id); deleteDashboard(T.ctx, fin.id); deleteDashboard(T.ctx, empty.id)
  const [last] = listDashboards(T.ctx)
  expect(() => deleteDashboard(T.ctx, last.id)).toThrow(expect.objectContaining({ code: 'CONFLICT' }))
})

test('dados dos blocos batem com os serviços existentes; fonte herdada e sobrescrita', () => {
  const emp = createCompany(T.ctx, { name: 'Empresa', color: '#f00' })
  const p = createProject(T.ctx, { companyId: emp.id, folderId: null, name: 'P', color: '#000' })
  const pp = createProject(T.ctx, { companyId: 1, folderId: null, name: 'Pessoal P', color: '#000' })
  const col = (pid: number) => getBoard(T.ctx, (T.ctx.db.prepare('SELECT id FROM boards WHERE project_id = ?').get(pid) as { id: number }).id, {}).columns
  createTask(T.ctx, { columnId: col(p.id)[0].id, title: 'a', dueAt: '2026-11-20', priority: 'urgent' })
  const t2 = createTask(T.ctx, { columnId: col(p.id)[0].id, title: 'b' })
  setTaskStatus(T.ctx, t2.id, 'done')
  createTask(T.ctx, { columnId: col(pp.id)[0].id, title: 'c', dueAt: '2026-11-27' })
  const v1 = getDashboard(T.ctx, { scope: 'all' })
  const inherit = { source: { kind: 'inherit' as const } }
  const kpi = (metric: string, scope: unknown = 'all', config: object = inherit) =>
    getWidgetData(T.ctx, { widget: { type: 'kpi', config: { ...config, metric } as never }, dashboardScope: scope as never })
  expect(kpi('total')).toEqual({ kind: 'kpi', value: v1.kpis.total, format: 'int' })
  expect(kpi('overdue')).toMatchObject({ value: 1 })
  expect(kpi('total', 'personal')).toMatchObject({ value: 1 })
  expect(kpi('total', 'personal', { source: { kind: 'scope', scope: { companyId: emp.id } } })).toMatchObject({ value: 2 })
  createShoppingItem(T.ctx, { name: 'x', quantity: 2, priceCents: 500 })
  const bought = createShoppingItem(T.ctx, { name: 'y', priceCents: 300 })
  setBought(T.ctx, bought.id, true)
  expect(kpi('shoppingPending')).toEqual({ kind: 'kpi', value: 1000, format: 'brl' })
  expect(kpi('shoppingMonth')).toMatchObject({ value: 300, format: 'brl' })
  createIdea(T.ctx, { title: 'i' })
  expect(kpi('ideasNew')).toMatchObject({ value: 1 })
  createBlock(T.ctx, { date: '2026-11-25', startTime: '09:00', endTime: '10:00', title: 'b' })
  expect(kpi('dayBlocks')).toMatchObject({ value: 1 })
  const chart = (data: string) => getWidgetData(T.ctx, { widget: { type: 'chart', config: { ...inherit, chart: 'bar', data } as never }, dashboardScope: 'all' })
  expect(chart('byPriority')).toMatchObject({ kind: 'chart', rows: expect.arrayContaining([expect.objectContaining({ label: 'Urgente', value: 1 })]) })
  expect(chart('byStatus')).toMatchObject({ rows: [{ label: 'A fazer', value: 2 }, { label: 'Em andamento', value: 0 }, { label: 'Concluído', value: 1 }] })
  expect((chart('byCompany') as { rows: unknown[] }).rows).toHaveLength(2)
  expect((chart('byProject') as unknown as { rows: { label: string }[] }).rows.map((r) => r.label).sort()).toEqual(['P', 'Pessoal P'])
  expect((chart('createdVsCompleted') as { rows: unknown[] }).rows).toHaveLength(8)
  expect((chart('shoppingByCategory') as unknown as { rows: { pending: number }[] }).rows[0].pending).toBe(10)
  const list = getWidgetData(T.ctx, { widget: { type: 'taskList', config: { ...inherit, list: 'overdue' } }, dashboardScope: 'all' })
  expect(list).toMatchObject({ kind: 'taskList', items: [expect.objectContaining({ title: 'a' })] })
  const projects = getWidgetData(T.ctx, { widget: { type: 'projects', config: inherit }, dashboardScope: 'professional' })
  expect(projects).toMatchObject({ kind: 'projects', items: [expect.objectContaining({ name: 'P', total: 2, done: 1, overdue: 1 })] })
  const shop = getWidgetData(T.ctx, { widget: { type: 'shopping', config: inherit }, dashboardScope: 'all' })
  expect(shop).toMatchObject({ kind: 'shopping', pendingCents: 1000, items: [expect.objectContaining({ name: 'x' })] })
  const summary = getWidgetData(T.ctx, { widget: { type: 'summary', config: { ...inherit, metrics: ['total', 'done'] } }, dashboardScope: 'all' })
  expect(summary).toMatchObject({ kind: 'summary', items: [{ metric: 'total', value: 3 }, { metric: 'done', value: 1 }] })
})
