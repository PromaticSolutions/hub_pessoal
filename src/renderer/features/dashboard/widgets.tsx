import { useEffect, useState, type ReactNode } from 'react'
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { GripVertical, Settings2, X } from 'lucide-react'
import type { ApiMethods } from '@shared/api'
import { formatBRL } from '@shared/money'
import type { DashboardScope, WidgetConfig, WidgetType } from '@shared/widgets'
import { Dot, PriorityBadge } from '../../components/ui'
import { useApiQuery } from '../../lib/queries'
import { cx, formatShort } from '../../lib/format'
import { useOpenTask } from '../board/BoardView'
import { AppNavLink } from '../../app/tabs-context'

type Data = ApiMethods['widgets.data']['output']
export type WidgetRecord = ApiMethods['dashboards.get']['output']['widgets'][number]

/* Validated (dataviz) two-series pair + palettes for categorical rows. */
const SERIES = { light: ['#4F46E5', '#D97706', '#0EA5E9', '#10B981'], dark: ['#818CF8', '#D97706', '#38BDF8', '#34D399'] }
const PIE_FALLBACK = ['#6366F1', '#0EA5E9', '#14B8A6', '#F59E0B', '#EC4899', '#84CC16', '#A855F7', '#F97316', '#64748B', '#EF4444']

export function useIsDark() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'))
  useEffect(() => {
    const obs = new MutationObserver(() => setDark(document.documentElement.classList.contains('dark')))
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => obs.disconnect()
  }, [])
  return dark
}

const fmt = (v: number, format: 'int' | 'brl') => (format === 'brl' ? formatBRL(v) : String(v))

function ChartView({ data, config }: { data: Extract<Data, { kind: 'chart' }>; config: WidgetConfig }) {
  const dark = useIsDark()
  const axis = dark ? '#a1a1aa' : '#71717a'
  const grid = dark ? '#27272a' : '#e4e4e7'
  const surface = dark ? '#17171b' : '#ffffff'
  const tooltipStyle = { background: surface, border: `1px solid ${grid}`, borderRadius: 6, fontSize: 12, color: dark ? '#e4e4e7' : '#18181b' }
  const palette = SERIES[dark ? 'dark' : 'light']
  const kind = config.chart ?? 'bar'
  const money = data.format === 'brl'
  const tick = (v: number) => (money ? `R$${v}` : String(v))
  const valFmt = (v: unknown) => (money ? formatBRL(Math.round(Number(v) * 100)) : String(v))
  const single = data.series.length === 1
  const colorFor = (i: number, s?: { color?: string }) => (single && config.color ? config.color : s?.color ?? palette[i % palette.length])
  if (!data.rows.length) return <div className="flex h-full items-center justify-center text-xs text-zinc-400">Sem dados para exibir.</div>

  if (kind === 'table')
    return (
      <div className="h-full overflow-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-zinc-500">
              <th className="pb-1 font-medium">Item</th>
              {data.series.map((s) => <th key={s.key} className="pb-1 text-right font-medium">{s.label}</th>)}
              {data.series.length > 1 && <th className="pb-1 text-right font-medium">Total</th>}
            </tr>
          </thead>
          <tbody>
            {data.rows.map((r) => (
              <tr key={String(r.key)} className="border-t border-[var(--line)]">
                <td className="py-1"><span className="flex items-center gap-2">{r.color && <Dot color={String(r.color)} size={8} />}{r.label}</span></td>
                {data.series.map((s) => <td key={s.key} className="py-1 text-right tabular-nums">{valFmt(r[s.key] ?? 0)}</td>)}
                {data.series.length > 1 && <td className="py-1 text-right font-medium tabular-nums">{valFmt(data.series.reduce((n, s) => n + Number(r[s.key] ?? 0), 0))}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )

  if (kind === 'pie' || kind === 'donut') {
    const valueKey = single ? data.series[0].key : 'value'
    return (
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={data.rows} dataKey={valueKey} nameKey="label" innerRadius={kind === 'donut' ? '55%' : 0} outerRadius="80%" stroke={surface} strokeWidth={2} paddingAngle={kind === 'donut' ? 1 : 0}>
            {data.rows.map((r, i) => <Cell key={String(r.key)} fill={r.color ? String(r.color) : PIE_FALLBACK[i % PIE_FALLBACK.length]} />)}
          </Pie>
          <Tooltip contentStyle={tooltipStyle} formatter={(v) => valFmt(v)} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
        </PieChart>
      </ResponsiveContainer>
    )
  }

  if (kind === 'line')
    return (
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data.rows} margin={{ right: 12, top: 6 }}>
          <CartesianGrid vertical={false} stroke={grid} />
          <XAxis dataKey="label" stroke={axis} fontSize={11} />
          <YAxis allowDecimals={false} stroke={axis} fontSize={11} tickFormatter={tick} width={money ? 56 : 32} />
          <Tooltip contentStyle={tooltipStyle} formatter={(v) => valFmt(v)} />
          {!single && <Legend wrapperStyle={{ fontSize: 12 }} />}
          {data.series.map((s, i) => (
            <Line key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={colorFor(i, s)} strokeWidth={2} strokeDasharray={i === 1 ? '5 3' : undefined} dot={{ r: 3.5 }} activeDot={{ r: 5 }} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    )

  const stacked = kind === 'stackedBar'
  const horizontal = stacked && data.rows.length > 0 && data.rows.length <= 8
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data.rows} layout={horizontal ? 'vertical' : 'horizontal'} margin={{ right: 12, top: 6 }}>
        <CartesianGrid horizontal={!horizontal} vertical={horizontal} stroke={grid} />
        {horizontal ? (
          <>
            <XAxis type="number" allowDecimals={false} stroke={axis} fontSize={11} tickFormatter={tick} />
            <YAxis type="category" dataKey="label" width={100} stroke={axis} fontSize={11} />
          </>
        ) : (
          <>
            <XAxis dataKey="label" stroke={axis} fontSize={11} />
            <YAxis allowDecimals={false} stroke={axis} fontSize={11} tickFormatter={tick} width={money ? 56 : 32} />
          </>
        )}
        <Tooltip contentStyle={tooltipStyle} cursor={{ fill: grid, opacity: 0.4 }} formatter={(v) => valFmt(v)} />
        {!single && <Legend wrapperStyle={{ fontSize: 12 }} />}
        {data.series.map((s, i) => (
          <Bar key={s.key} dataKey={s.key} name={s.label} stackId={stacked ? 'a' : undefined} fill={colorFor(i, s)} stroke={stacked ? surface : undefined} strokeWidth={stacked ? 2 : 0} radius={stacked ? 0 : [4, 4, 0, 0]} maxBarSize={40}>
            {single && !config.color && data.rows.some((r) => r.color) && data.rows.map((r, j) => <Cell key={j} fill={r.color ? String(r.color) : colorFor(i, s)} />)}
          </Bar>
        ))}
      </BarChart>
    </ResponsiveContainer>
  )
}

function WidgetBody({ type, config, data }: { type: WidgetType; config: WidgetConfig; data: Data }) {
  const open = useOpenTask()
  switch (data.kind) {
    case 'kpi':
      return (
        <div className="flex h-full flex-col justify-center">
          <div
            data-testid={`kpi-${config.metric}`}
            className={cx('text-3xl font-semibold tabular-nums', config.metric === 'overdue' && data.value > 0 && 'text-red-600', config.metric === 'nearDue' && data.value > 0 && 'text-amber-600')}
            style={config.color ? { color: config.color } : undefined}
          >
            {fmt(data.value, data.format)}
          </div>
        </div>
      )
    case 'summary':
      return (
        <div className="grid h-full grid-cols-[repeat(auto-fit,minmax(110px,1fr))] content-center gap-3">
          {data.items.map((i) => (
            <div key={i.metric}>
              <div className="text-xl font-semibold tabular-nums">{fmt(i.value, i.format)}</div>
              <div className="text-xs text-zinc-500">{i.label}</div>
            </div>
          ))}
        </div>
      )
    case 'chart':
      return <ChartView data={data} config={config} />
    case 'taskList':
      return (
        <div className="h-full overflow-y-auto" data-testid={config.list === 'nearDue' ? 'list-neardue' : config.list === 'overdue' ? 'list-overdue' : undefined}>
          {!data.items.length ? (
            <div className="text-xs text-zinc-500">{config.list === 'overdue' ? 'Nada atrasado. 🎉' : 'Nenhuma tarefa.'}</div>
          ) : (
            <ul className="space-y-0.5">
              {data.items.map((t) => (
                <li key={t.id}>
                  <button className="flex w-full items-center gap-2 rounded px-1 py-1 text-left text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800/50" onClick={() => open(t.id)}>
                    <Dot color={t.companyColor} size={8} />
                    <span className="min-w-0 flex-1 truncate">{t.title}</span>
                    <span className="hidden truncate text-xs text-zinc-500 sm:inline">{t.projectName}</span>
                    <PriorityBadge priority={t.priority} />
                    <span className={cx('w-16 text-right text-xs', t.isOverdue ? 'font-semibold text-red-600' : 'text-zinc-500')}>{formatShort(t.dueAt)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )
    case 'projects':
      return (
        <div className="h-full space-y-2 overflow-y-auto">
          {!data.items.length && <div className="text-xs text-zinc-500">Nenhum projeto ativo.</div>}
          {data.items.map((p) => {
            const pct = p.total ? Math.round((p.done / p.total) * 100) : 0
            return (
              <AppNavLink key={p.id} to={`/projects/${p.id}`} className="block rounded px-1 py-1 hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                <div className="flex items-center gap-2 text-sm">
                  <span className="h-2 w-2 rounded-[2px]" style={{ background: p.color }} />
                  <span className="min-w-0 flex-1 truncate font-medium">{p.name}</span>
                  <span className="text-xs text-zinc-500">{p.done}/{p.total}</span>
                  {p.overdue > 0 && <span className="text-xs font-semibold text-red-600">{p.overdue} atrasada(s)</span>}
                </div>
                <div className="ml-4 mt-1 h-1 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} /></div>
              </AppNavLink>
            )
          })}
        </div>
      )
    case 'shopping':
      return (
        <div className="flex h-full flex-col gap-2">
          <div>
            <div className="text-2xl font-semibold tabular-nums">{formatBRL(data.pendingCents)}</div>
            {!!data.pendingWithoutPrice && <div className="text-xs text-amber-600">{data.pendingWithoutPrice} item(ns) sem preço</div>}
          </div>
          <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto text-sm">
            {data.items.map((i) => (
              <li key={i.id} className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate">{i.name}</span>
                <span className="text-xs text-zinc-500">{String(i.quantity).replace('.', ',')}×</span>
                <span className="w-20 text-right text-xs tabular-nums">{i.priceCents == null ? '—' : formatBRL(Math.round(i.priceCents * i.quantity))}</span>
              </li>
            ))}
          </ul>
          <AppNavLink to="/shopping" className="text-xs text-indigo-600 hover:underline">Abrir lista de compras →</AppNavLink>
        </div>
      )
  }
  void type
  return null
}

export function WidgetFrame({ w, scope, editing, onEdit, onRemove }: { w: WidgetRecord; scope: DashboardScope; editing: boolean; onEdit: () => void; onRemove: () => void }): ReactNode {
  const { data } = useApiQuery('widgets.data', { widget: { type: w.type, config: w.config as never }, dashboardScope: scope })
  return (
    <div data-testid={`widget-${w.id}`} className={cx('surface flex h-full flex-col overflow-hidden', !editing && 'lift', editing && 'ring-1 ring-indigo-500/30')}>
      <div className="flex items-center gap-1.5 px-4 pb-1 pt-3">
        {editing && <span className="widget-drag -ml-1 cursor-grab text-zinc-400" title="Arrastar"><GripVertical size={14} /></span>}
        <h3 className={cx('min-w-0 flex-1 truncate tracking-tight', w.type === 'kpi' ? 'text-xs font-medium text-zinc-500' : 'text-sm font-semibold')}>{w.title}</h3>
        {editing && (
          <>
            <button data-testid={`widget-edit-${w.id}`} aria-label="Configurar bloco" className="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800" onClick={onEdit}><Settings2 size={14} /></button>
            <button data-testid={`widget-remove-${w.id}`} aria-label="Remover bloco" className="rounded p-1 text-zinc-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40" onClick={onRemove}><X size={14} /></button>
          </>
        )}
      </div>
      <div className="min-h-0 flex-1 px-4 pb-3">{data ? <WidgetBody type={w.type} config={w.config as WidgetConfig} data={data} /> : null}</div>
    </div>
  )
}
