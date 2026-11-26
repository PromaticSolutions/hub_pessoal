import type { Priority, TaskFilter, TaskListItem } from '@shared/types'
import { PRIORITIES } from '@shared/constants'
import { addDays, getWeekRange, parseLocalDate } from '@shared/dates'
import type { AppContext } from '../context'
import { getSetting } from './settings'
import { buildTaskWhere, queryTasks } from './taskQuery'

import type { DashboardScope } from '@shared/widgets'
export type { DashboardScope }

export type DashboardData = {
  kpis: { total: number; todo: number; inProgress: number; done: number; overdue: number; nearDue: number; activeProjects: number; companies: number }
  byPriority: { priority: Priority; count: number }[]
  byCompany: { companyId: number; name: string; color: string; low: number; medium: number; high: number; urgent: number }[]
  completedPerWeek: { weekStart: string; count: number }[]
  createdVsCompleted: { weekStart: string; created: number; completed: number }[]
  overdueList: TaskListItem[]
  nearDueList: TaskListItem[]
}

export function scopeFilter(scope: DashboardScope): TaskFilter {
  if (scope === 'all') return {}
  if (scope === 'personal' || scope === 'professional') return { scope }
  if ('companyId' in scope) return { companyIds: [scope.companyId] }
  return { projectIds: [scope.projectId] }
}

export async function getDashboard(ctx: AppContext, input: { scope: DashboardScope }): Promise<DashboardData> {
  const filter = scopeFilter(input.scope)
  const all = await queryTasks(ctx, { filter, sort: 'due' })
  const open = all.filter((t) => t.status !== 'done')

  const kpis = {
    total: all.length,
    todo: all.filter((t) => t.status === 'todo').length,
    inProgress: all.filter((t) => t.status === 'in_progress').length,
    done: all.filter((t) => t.status === 'done').length,
    overdue: open.filter((t) => t.isOverdue).length,
    nearDue: open.filter((t) => t.isNearDue).length,
    activeProjects: 0,
    companies: (await ctx.db.one<{ n: number }>("SELECT count(*) n FROM companies WHERE status = 'active' AND is_personal = 0"))!.n
  }
  const pw: string[] = ["p.status = 'active'", 'p.archived_at IS NULL', "co.status = 'active'"]
  const pp: unknown[] = []
  const s = input.scope
  if (s === 'personal') pw.push('co.is_personal = 1')
  else if (s === 'professional') pw.push('co.is_personal = 0')
  else if (typeof s === 'object' && 'companyId' in s) { pw.push('co.id = ?'); pp.push(s.companyId) }
  else if (typeof s === 'object' && 'projectId' in s) { pw.push('p.id = ?'); pp.push(s.projectId) }
  kpis.activeProjects = (await ctx.db.one<{ n: number }>(`SELECT count(*) n FROM projects p JOIN companies co ON co.id = p.company_id WHERE ${pw.join(' AND ')}`, pp))!.n

  const byPriority = PRIORITIES.map((priority) => ({ priority, count: open.filter((t) => t.priority === priority).length }))

  const companyMap = new Map<number, DashboardData['byCompany'][number]>()
  for (const t of open) {
    const row = companyMap.get(t.companyId) ?? { companyId: t.companyId, name: t.companyName, color: t.companyColor, low: 0, medium: 0, high: 0, urgent: 0 }
    row[t.priority]++
    companyMap.set(t.companyId, row)
  }
  const byCompany = [...companyMap.values()].sort((a, b) => b.urgent + b.high + b.medium + b.low - (a.urgent + a.high + a.medium + a.low))

  const weekStartsOn = await getSetting<0 | 1>(ctx.db, 'weekStartsOn', 1)
  const now = ctx.now()
  const weeks = Array.from({ length: 8 }, (_, i) => getWeekRange(addDays(now, -7 * (7 - i)), weekStartsOn))
  const { where, params } = buildTaskWhere(ctx, filter)
  // Local-day bounds computed in JS (UTC ISO instants), since created_at/completed_at are UTC ISO text.
  const countIn = async (col: 'created_at' | 'completed_at', start: string, end: string) =>
    (await ctx.db.one<{ n: number }>(
      `SELECT count(*) n FROM v_tasks t WHERE ${where} AND t.${col} IS NOT NULL AND t.${col} >= ? AND t.${col} < ?`,
      [...params, parseLocalDate(start).toISOString(), addDays(parseLocalDate(end), 1).toISOString()]
    ))!.n
  const createdVsCompleted: DashboardData['createdVsCompleted'] = []
  for (const w of weeks) {
    createdVsCompleted.push({ weekStart: w.start, created: await countIn('created_at', w.start, w.end), completed: await countIn('completed_at', w.start, w.end) })
  }
  const completedPerWeek = createdVsCompleted.map((w) => ({ weekStart: w.weekStart, count: w.completed }))

  return {
    kpis,
    byPriority,
    byCompany,
    completedPerWeek,
    createdVsCompleted,
    overdueList: open.filter((t) => t.isOverdue).slice(0, 10),
    nearDueList: open.filter((t) => t.isNearDue).slice(0, 10)
  }
}
