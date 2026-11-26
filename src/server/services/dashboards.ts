import type { DashboardScope, TemplateKey, WidgetConfig, WidgetType } from '@shared/widgets'
import { TEMPLATES, WIDGET_DEFAULTS } from '@shared/widgets'
import type { AppContext } from '../context'
import { AppError } from '../lib/errors'
import { must, requireName } from '../lib/rows'

export type Dashboard = { id: number; name: string; scope: DashboardScope; position: number; createdAt: string }
export type Widget = { id: number; dashboardId: number; type: WidgetType; title: string; config: WidgetConfig; x: number; y: number; w: number; h: number }

type DRow = { id: number; name: string; scope: string; position: number; created_at: string }
type WRow = { id: number; dashboard_id: number; type: WidgetType; title: string; config: string; x: number; y: number; w: number; h: number }

const parse = <T>(s: string, fb: T): T => { try { return JSON.parse(s) as T } catch { return fb } }
const toD = (r: DRow): Dashboard => ({ id: r.id, name: r.name, scope: parse<DashboardScope>(r.scope, 'all'), position: r.position, createdAt: r.created_at })
const toW = (r: WRow): Widget => ({ id: r.id, dashboardId: r.dashboard_id, type: r.type, title: r.title, config: parse<WidgetConfig>(r.config, { source: { kind: 'inherit' } }), x: r.x, y: r.y, w: r.w, h: r.h })

function getD(ctx: AppContext, id: number): Dashboard {
  return toD(must(ctx.db.prepare('SELECT * FROM dashboards WHERE id = ?').get(id) as DRow | undefined, 'Dashboard'))
}
function getW(ctx: AppContext, id: number): Widget {
  return toW(must(ctx.db.prepare('SELECT * FROM dashboard_widgets WHERE id = ?').get(id) as WRow | undefined, 'Bloco'))
}

export function listDashboards(ctx: AppContext): Dashboard[] {
  return (ctx.db.prepare('SELECT * FROM dashboards ORDER BY position, id').all() as DRow[]).map(toD)
}

export function getDashboardFull(ctx: AppContext, id: number): { dashboard: Dashboard; widgets: Widget[] } {
  return { dashboard: getD(ctx, id), widgets: (ctx.db.prepare('SELECT * FROM dashboard_widgets WHERE dashboard_id = ? ORDER BY y, x, id').all(id) as WRow[]).map(toW) }
}

const insW = (ctx: AppContext, dashboardId: number, w: { type: WidgetType; title: string; config: WidgetConfig; x: number; y: number; w: number; h: number }) =>
  ctx.db
    .prepare('INSERT INTO dashboard_widgets(dashboard_id, type, title, config, x, y, w, h) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(dashboardId, w.type, w.title, JSON.stringify(w.config), w.x, w.y, w.w, w.h).lastInsertRowid as number

export function createDashboard(ctx: AppContext, input: { name: string; template?: TemplateKey | 'empty'; duplicateOf?: number }): Dashboard {
  const name = requireName(input.name)
  return ctx.db.transaction(() => {
    const src = input.duplicateOf != null ? getDashboardFull(ctx, input.duplicateOf) : null
    const tpl = !src && input.template && input.template !== 'empty' ? TEMPLATES[input.template] : null
    const scope = src?.dashboard.scope ?? tpl?.scope ?? 'all'
    const id = ctx.db
      .prepare('INSERT INTO dashboards(name, scope, position) VALUES (?, ?, (SELECT coalesce(max(position), 0) + 1024 FROM dashboards))')
      .run(name, JSON.stringify(scope)).lastInsertRowid as number
    for (const w of src?.widgets ?? tpl?.widgets ?? []) insW(ctx, id, w)
    return getD(ctx, id)
  })()
}

export function renameDashboard(ctx: AppContext, id: number, name: string): Dashboard {
  getD(ctx, id)
  ctx.db.prepare('UPDATE dashboards SET name = ? WHERE id = ?').run(requireName(name), id)
  return getD(ctx, id)
}

export function setDashboardScope(ctx: AppContext, id: number, scope: DashboardScope): Dashboard {
  getD(ctx, id)
  ctx.db.prepare('UPDATE dashboards SET scope = ? WHERE id = ?').run(JSON.stringify(scope), id)
  return getD(ctx, id)
}

export function deleteDashboard(ctx: AppContext, id: number): void {
  getD(ctx, id)
  const n = (ctx.db.prepare('SELECT count(*) n FROM dashboards').get() as { n: number }).n
  if (n <= 1) throw new AppError('CONFLICT', 'Não é possível excluir o único dashboard.')
  ctx.db.prepare('DELETE FROM dashboards WHERE id = ?').run(id)
}

export function addWidget(ctx: AppContext, input: { dashboardId: number; type: WidgetType; title?: string; config?: WidgetConfig }): Widget {
  getD(ctx, input.dashboardId)
  const def = WIDGET_DEFAULTS[input.type]
  const bottom = (ctx.db.prepare('SELECT coalesce(max(y + h), 0) b FROM dashboard_widgets WHERE dashboard_id = ?').get(input.dashboardId) as { b: number }).b
  const id = insW(ctx, input.dashboardId, { type: input.type, title: input.title ?? def.title, config: input.config ?? def.config, x: 0, y: bottom, w: def.w, h: def.h })
  return getW(ctx, id)
}

export function updateWidget(ctx: AppContext, id: number, patch: { title?: string; type?: WidgetType; config?: WidgetConfig; w?: number; h?: number }): Widget {
  const cur = getW(ctx, id)
  ctx.db
    .prepare('UPDATE dashboard_widgets SET title = ?, type = ?, config = ?, w = ?, h = ? WHERE id = ?')
    .run(patch.title ?? cur.title, patch.type ?? cur.type, JSON.stringify(patch.config ?? cur.config), Math.min(12, Math.max(1, patch.w ?? cur.w)), Math.max(1, patch.h ?? cur.h), id)
  return getW(ctx, id)
}

export function removeWidget(ctx: AppContext, id: number): void {
  getW(ctx, id)
  ctx.db.prepare('DELETE FROM dashboard_widgets WHERE id = ?').run(id)
}

export function saveLayout(ctx: AppContext, input: { dashboardId: number; items: { id: number; x: number; y: number; w: number; h: number }[] }): void {
  const upd = ctx.db.prepare('UPDATE dashboard_widgets SET x = ?, y = ?, w = ?, h = ? WHERE id = ? AND dashboard_id = ?')
  ctx.db.transaction(() => {
    for (const i of input.items) upd.run(Math.max(0, Math.round(i.x)), Math.max(0, Math.round(i.y)), Math.min(12, Math.max(1, Math.round(i.w))), Math.max(1, Math.round(i.h)), i.id, input.dashboardId)
  })()
}
