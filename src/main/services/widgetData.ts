import type { Priority, TaskListItem } from '@shared/types'
import { CATEGORY_LABELS, PRIORITIES, PRIORITY_LABELS } from '@shared/constants'
import { toLocalDate, toLocalMinute } from '@shared/dates'
import type { DashboardScope, KpiMetric, WidgetConfig, WidgetType } from '@shared/widgets'
import { KPI_LABELS } from '@shared/widgets'
import type { AppContext } from '../context'
import { getDashboard, scopeFilter } from './dashboard'
import { queryTasks } from './taskQuery'
import { listShopping, shoppingTotals, type ShoppingItem } from './shopping'

export type WidgetData =
  | { kind: 'kpi'; value: number; format: 'int' | 'brl' }
  | { kind: 'summary'; items: { metric: KpiMetric; label: string; value: number; format: 'int' | 'brl' }[] }
  | { kind: 'chart'; series: { key: string; label: string; color?: string }[]; rows: Record<string, string | number>[]; format: 'int' | 'brl' }
  | { kind: 'taskList'; items: TaskListItem[] }
  | { kind: 'projects'; items: { id: number; name: string; color: string; companyName: string; companyColor: string; done: number; total: number; overdue: number }[] }
  | { kind: 'shopping'; pendingCents: number; pendingWithoutPrice: number; items: ShoppingItem[] }

const PRIORITY_COLORS_SEQ: Record<Priority, string> = { urgent: '#312E81', high: '#4F46E5', medium: '#818CF8', low: '#C7D2FE' }

function resolveScope(config: WidgetConfig, dashboardScope: DashboardScope): DashboardScope {
  return config.source?.kind === 'scope' ? config.source.scope : dashboardScope
}

function metricValue(ctx: AppContext, metric: KpiMetric, scope: DashboardScope, cache: { d?: ReturnType<typeof getDashboard>; s?: ReturnType<typeof shoppingTotals> }): { value: number; format: 'int' | 'brl' } {
  switch (metric) {
    case 'shoppingPending':
      return { value: (cache.s ??= shoppingTotals(ctx)).pendingCents, format: 'brl' }
    case 'shoppingMonth':
      return { value: (cache.s ??= shoppingTotals(ctx)).boughtThisMonthCents, format: 'brl' }
    case 'ideasNew':
      return { value: (ctx.db.prepare("SELECT count(*) n FROM ideas WHERE status = 'new'").get() as { n: number }).n, format: 'int' }
    case 'dayBlocks':
      return { value: (ctx.db.prepare('SELECT count(*) n FROM day_blocks WHERE date = ?').get(toLocalDate(ctx.now())) as { n: number }).n, format: 'int' }
    default:
      return { value: (cache.d ??= getDashboard(ctx, { scope })).kpis[metric], format: 'int' }
  }
}

const weekLabel = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`

export function getWidgetData(ctx: AppContext, input: { widget: { type: WidgetType; config: WidgetConfig }; dashboardScope: DashboardScope }): WidgetData {
  const { type, config } = input.widget
  const scope = resolveScope(config, input.dashboardScope)
  const cache: { d?: ReturnType<typeof getDashboard>; s?: ReturnType<typeof shoppingTotals> } = {}
  const dash = () => (cache.d ??= getDashboard(ctx, { scope }))

  switch (type) {
    case 'kpi': {
      const v = metricValue(ctx, config.metric ?? 'total', scope, cache)
      return { kind: 'kpi', ...v }
    }
    case 'summary': {
      const metrics = config.metrics?.length ? config.metrics : (['todo', 'inProgress', 'done', 'overdue'] as KpiMetric[])
      return { kind: 'summary', items: metrics.map((metric) => ({ metric, label: KPI_LABELS[metric], ...metricValue(ctx, metric, scope, cache) })) }
    }
    case 'chart': {
      const data = config.data ?? 'byPriority'
      if (data === 'byPriority')
        return { kind: 'chart', format: 'int', series: [{ key: 'value', label: 'Tarefas' }], rows: dash().byPriority.map((p) => ({ key: p.priority, label: PRIORITY_LABELS[p.priority], value: p.count, color: PRIORITY_COLORS_SEQ[p.priority] })) }
      if (data === 'byStatus') {
        const k = dash().kpis
        return {
          kind: 'chart',
          format: 'int',
          series: [{ key: 'value', label: 'Tarefas' }],
          rows: [
            { key: 'todo', label: CATEGORY_LABELS.todo, value: k.todo, color: '#94A3B8' },
            { key: 'in_progress', label: CATEGORY_LABELS.in_progress, value: k.inProgress, color: '#0EA5E9' },
            { key: 'done', label: CATEGORY_LABELS.done, value: k.done, color: '#10B981' }
          ]
        }
      }
      if (data === 'byCompany')
        return {
          kind: 'chart',
          format: 'int',
          series: [...PRIORITIES].reverse().map((p) => ({ key: p, label: PRIORITY_LABELS[p], color: PRIORITY_COLORS_SEQ[p] })),
          rows: dash().byCompany.map((c) => ({ key: String(c.companyId), label: c.name, color: c.color, low: c.low, medium: c.medium, high: c.high, urgent: c.urgent, value: c.low + c.medium + c.high + c.urgent }))
        }
      if (data === 'byProject') {
        const map = new Map<number, { key: string; label: string; color: string; value: number }>()
        for (const t of queryTasks(ctx, { filter: { ...scopeFilter(scope), includeDone: false }, sort: 'due' })) {
          const r = map.get(t.projectId) ?? { key: String(t.projectId), label: t.projectName, color: t.projectColor, value: 0 }
          r.value++
          map.set(t.projectId, r)
        }
        return { kind: 'chart', format: 'int', series: [{ key: 'value', label: 'Tarefas abertas' }], rows: [...map.values()].sort((a, b) => b.value - a.value).slice(0, 12) }
      }
      if (data === 'productivity')
        return { kind: 'chart', format: 'int', series: [{ key: 'value', label: 'Concluídas' }], rows: dash().completedPerWeek.map((w) => ({ key: w.weekStart, label: weekLabel(w.weekStart), value: w.count })) }
      if (data === 'createdVsCompleted')
        return {
          kind: 'chart',
          format: 'int',
          series: [{ key: 'created', label: 'Criadas' }, { key: 'completed', label: 'Concluídas' }],
          rows: dash().createdVsCompleted.map((w) => ({ key: w.weekStart, label: weekLabel(w.weekStart), created: w.created, completed: w.completed }))
        }
      const s = (cache.s ??= shoppingTotals(ctx))
      return {
        kind: 'chart',
        format: 'brl',
        series: [{ key: 'pending', label: 'Pendente (R$)' }, { key: 'bought', label: 'Comprado no mês (R$)' }],
        rows: s.byCategory.map((c) => ({ key: c.category, label: c.category, pending: c.pendingCents / 100, bought: c.boughtMonthCents / 100, value: c.pendingCents / 100 }))
      }
    }
    case 'taskList': {
      const limit = config.limit ?? 10
      if (config.list === 'nearDue') return { kind: 'taskList', items: dash().nearDueList.slice(0, limit) }
      if (config.list === 'filter') return { kind: 'taskList', items: queryTasks(ctx, { filter: { includeDone: false, ...scopeFilter(scope), ...(config.filter ?? {}) }, sort: 'due', limit }) }
      return { kind: 'taskList', items: dash().overdueList.slice(0, limit) }
    }
    case 'projects': {
      const f = scopeFilter(scope)
      const w: string[] = ["p.status = 'active'", 'p.archived_at IS NULL', "co.status = 'active'"]
      const params: unknown[] = []
      if (f.scope === 'personal') w.push('co.is_personal = 1')
      if (f.scope === 'professional') w.push('co.is_personal = 0')
      if (f.companyIds?.length) { w.push('co.id = ?'); params.push(f.companyIds[0]) }
      if (f.projectIds?.length) { w.push('p.id = ?'); params.push(f.projectIds[0]) }
      const now = toLocalMinute(ctx.now())
      const items = ctx.db
        .prepare(
          `SELECT p.id, p.name, p.color, co.name AS company_name, co.color AS company_color,
             (SELECT count(*) FROM v_tasks t WHERE t.project_id = p.id AND NOT t.effective_archived) AS total,
             (SELECT count(*) FROM v_tasks t WHERE t.project_id = p.id AND NOT t.effective_archived AND t.status = 'done') AS done,
             (SELECT count(*) FROM v_tasks t WHERE t.project_id = p.id AND NOT t.effective_archived AND t.status <> 'done' AND t.due_end < ?) AS overdue
           FROM projects p JOIN companies co ON co.id = p.company_id WHERE ${w.join(' AND ')} ORDER BY co.is_personal, co.position, p.position`
        )
        .all(now, ...params) as { id: number; name: string; color: string; company_name: string; company_color: string; total: number; done: number; overdue: number }[]
      return { kind: 'projects', items: items.map((r) => ({ id: r.id, name: r.name, color: r.color, companyName: r.company_name, companyColor: r.company_color, total: r.total, done: r.done, overdue: r.overdue })) }
    }
    case 'shopping': {
      const s = (cache.s ??= shoppingTotals(ctx))
      return { kind: 'shopping', pendingCents: s.pendingCents, pendingWithoutPrice: s.pendingWithoutPrice, items: listShopping(ctx, { status: 'pending' }).slice(0, config.limit ?? 12) }
    }
  }
}
