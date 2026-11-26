import type { DashboardScope, TemplateKey, WidgetConfig, WidgetType } from '@shared/widgets'
import { TEMPLATES, WIDGET_DEFAULTS } from '@shared/widgets'
import type { AppContext } from '../context'
import { AppError } from '../lib/errors'
import { withTx } from '../db/tx'
import { insertId, must, requireName } from '../lib/rows'

export type Dashboard = { id: number; name: string; scope: DashboardScope; position: number; createdAt: string }
export type Widget = { id: number; dashboardId: number; type: WidgetType; title: string; config: WidgetConfig; x: number; y: number; w: number; h: number }

type DRow = { id: number; name: string; scope: string; position: number; created_at: string }
type WRow = { id: number; dashboard_id: number; type: WidgetType; title: string; config: string; x: number; y: number; w: number; h: number }

const parse = <T>(s: string, fb: T): T => { try { return JSON.parse(s) as T } catch { return fb } }
const toD = (r: DRow): Dashboard => ({ id: r.id, name: r.name, scope: parse<DashboardScope>(r.scope, 'all'), position: r.position, createdAt: r.created_at })
const toW = (r: WRow): Widget => ({ id: r.id, dashboardId: r.dashboard_id, type: r.type, title: r.title, config: parse<WidgetConfig>(r.config, { source: { kind: 'inherit' } }), x: r.x, y: r.y, w: r.w, h: r.h })

async function getD(ctx: AppContext, id: number): Promise<Dashboard> {
  return toD(must(await ctx.db.one<DRow>('SELECT * FROM dashboards WHERE id = ?', [id]), 'Dashboard'))
}
async function getW(ctx: AppContext, id: number): Promise<Widget> {
  return toW(must(await ctx.db.one<WRow>('SELECT * FROM dashboard_widgets WHERE id = ?', [id]), 'Bloco'))
}

export async function listDashboards(ctx: AppContext): Promise<Dashboard[]> {
  return (await ctx.db.many<DRow>('SELECT * FROM dashboards ORDER BY position, id')).map(toD)
}

export async function getDashboardFull(ctx: AppContext, id: number): Promise<{ dashboard: Dashboard; widgets: Widget[] }> {
  return {
    dashboard: await getD(ctx, id),
    widgets: (await ctx.db.many<WRow>('SELECT * FROM dashboard_widgets WHERE dashboard_id = ? ORDER BY y, x, id', [id])).map(toW)
  }
}

const insW = (ctx: AppContext, dashboardId: number, w: { type: WidgetType; title: string; config: WidgetConfig; x: number; y: number; w: number; h: number }) =>
  insertId(ctx.db, 'INSERT INTO dashboard_widgets(dashboard_id, type, title, config, x, y, w, h) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [
    dashboardId,
    w.type,
    w.title,
    JSON.stringify(w.config),
    w.x,
    w.y,
    w.w,
    w.h
  ])

export async function createDashboard(ctx: AppContext, input: { name: string; template?: TemplateKey | 'empty'; duplicateOf?: number }): Promise<Dashboard> {
  const name = requireName(input.name)
  return withTx(ctx, async (tx) => {
    const src = input.duplicateOf != null ? await getDashboardFull(tx, input.duplicateOf) : null
    const tpl = !src && input.template && input.template !== 'empty' ? TEMPLATES[input.template] : null
    const scope = src?.dashboard.scope ?? tpl?.scope ?? 'all'
    const id = await insertId(tx.db, 'INSERT INTO dashboards(name, scope, position) VALUES (?, ?, (SELECT coalesce(max(position), 0) + 1024 FROM dashboards))', [
      name,
      JSON.stringify(scope)
    ])
    for (const w of src?.widgets ?? tpl?.widgets ?? []) await insW(tx, id, w)
    return getD(tx, id)
  })
}

export async function renameDashboard(ctx: AppContext, id: number, name: string): Promise<Dashboard> {
  await getD(ctx, id)
  await ctx.db.run('UPDATE dashboards SET name = ? WHERE id = ?', [requireName(name), id])
  return getD(ctx, id)
}

export async function setDashboardScope(ctx: AppContext, id: number, scope: DashboardScope): Promise<Dashboard> {
  await getD(ctx, id)
  await ctx.db.run('UPDATE dashboards SET scope = ? WHERE id = ?', [JSON.stringify(scope), id])
  return getD(ctx, id)
}

export async function deleteDashboard(ctx: AppContext, id: number): Promise<void> {
  await getD(ctx, id)
  const n = (await ctx.db.one<{ n: number }>('SELECT count(*) n FROM dashboards'))!.n
  if (n <= 1) throw new AppError('CONFLICT', 'Não é possível excluir o único dashboard.')
  await ctx.db.run('DELETE FROM dashboards WHERE id = ?', [id])
}

export async function addWidget(ctx: AppContext, input: { dashboardId: number; type: WidgetType; title?: string; config?: WidgetConfig }): Promise<Widget> {
  await getD(ctx, input.dashboardId)
  const def = WIDGET_DEFAULTS[input.type]
  const bottom = (await ctx.db.one<{ b: number }>('SELECT coalesce(max(y + h), 0) b FROM dashboard_widgets WHERE dashboard_id = ?', [input.dashboardId]))!.b
  const id = await insW(ctx, input.dashboardId, { type: input.type, title: input.title ?? def.title, config: input.config ?? def.config, x: 0, y: bottom, w: def.w, h: def.h })
  return getW(ctx, id)
}

export async function updateWidget(
  ctx: AppContext,
  id: number,
  patch: { title?: string; type?: WidgetType; config?: WidgetConfig; w?: number; h?: number }
): Promise<Widget> {
  const cur = await getW(ctx, id)
  await ctx.db.run('UPDATE dashboard_widgets SET title = ?, type = ?, config = ?, w = ?, h = ? WHERE id = ?', [
    patch.title ?? cur.title,
    patch.type ?? cur.type,
    JSON.stringify(patch.config ?? cur.config),
    Math.min(12, Math.max(1, patch.w ?? cur.w)),
    Math.max(1, patch.h ?? cur.h),
    id
  ])
  return getW(ctx, id)
}

export async function removeWidget(ctx: AppContext, id: number): Promise<void> {
  await getW(ctx, id)
  await ctx.db.run('DELETE FROM dashboard_widgets WHERE id = ?', [id])
}

export async function saveLayout(
  ctx: AppContext,
  input: { dashboardId: number; items: { id: number; x: number; y: number; w: number; h: number }[] }
): Promise<void> {
  await withTx(ctx, async (tx) => {
    for (const i of input.items) {
      await tx.db.run('UPDATE dashboard_widgets SET x = ?, y = ?, w = ?, h = ? WHERE id = ? AND dashboard_id = ?', [
        Math.max(0, Math.round(i.x)),
        Math.max(0, Math.round(i.y)),
        Math.min(12, Math.max(1, Math.round(i.w))),
        Math.max(1, Math.round(i.h)),
        i.id,
        input.dashboardId
      ])
    }
  })
}
