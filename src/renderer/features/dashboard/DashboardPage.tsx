import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { Priority, TaskListItem } from '@shared/types'
import { PRIORITIES, PRIORITY_LABELS } from '@shared/constants'
import { Dot, EmptyState, PageHeader, PriorityBadge, Select } from '../../components/ui'
import { useApiQuery } from '../../lib/queries'
import { cx, formatShort } from '../../lib/format'
import { useOpenTask } from '../board/BoardView'
import { allProjects } from '../week/TaskFilters'
import { api } from '../../lib/api'

/* Validated with dataviz validate_palette.js (light #fff / dark #09090b). */
const SERIES = { light: { created: '#4F46E5', completed: '#D97706' }, dark: { created: '#818CF8', completed: '#D97706' } }
/* Priority is ordinal → one-hue sequential ramp, low = lightest (light mode) / dimmest (dark mode). */
const PRIO_RAMP: Record<'light' | 'dark', Record<Priority, string>> = {
  light: { low: '#C7D2FE', medium: '#818CF8', high: '#4F46E5', urgent: '#312E81' },
  dark: { low: '#3730A3', medium: '#4F46E5', high: '#818CF8', urgent: '#C7D2FE' }
}

function useIsDark() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'))
  useEffect(() => {
    const obs = new MutationObserver(() => setDark(document.documentElement.classList.contains('dark')))
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => obs.disconnect()
  }, [])
  return dark
}

type ScopeValue = string // 'all' | 'personal' | 'professional' | 'c:<id>' | 'p:<id>'
const toScope = (v: ScopeValue) =>
  v.startsWith('c:') ? { companyId: Number(v.slice(2)) } : v.startsWith('p:') ? { projectId: Number(v.slice(2)) } : (v as 'all' | 'personal' | 'professional')

function Kpi({ id, label, value, tone }: { id: string; label: string; value: number; tone?: 'danger' | 'warn' }) {
  return (
    <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      <div data-testid={`kpi-${id}`} className={cx('text-3xl font-semibold tabular-nums', tone === 'danger' && value > 0 && 'text-red-600', tone === 'warn' && value > 0 && 'text-amber-600')}>
        {value}
      </div>
      <div className="mt-1 text-xs text-zinc-500">{label}</div>
    </div>
  )
}

function TaskMiniList({ title, items, empty, testId }: { title: string; items: TaskListItem[]; empty: string; testId: string }) {
  const open = useOpenTask()
  return (
    <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800" data-testid={testId}>
      <h3 className="mb-2 text-sm font-semibold">{title}</h3>
      {!items.length ? (
        <div className="text-xs text-zinc-500">{empty}</div>
      ) : (
        <ul className="space-y-1">
          {items.map((t) => (
            <li key={t.id}>
              <button className="flex w-full items-center gap-2 rounded px-1 py-1 text-left text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800/50" onClick={() => open(t.id)}>
                <Dot color={t.companyColor} size={8} />
                <span className="min-w-0 flex-1 truncate">{t.title}</span>
                <span className="truncate text-xs text-zinc-500">{t.projectName}</span>
                <PriorityBadge priority={t.priority} />
                <span className={cx('w-16 text-right text-xs', t.isOverdue ? 'font-semibold text-red-600' : 'text-zinc-500')}>{formatShort(t.dueAt)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      <h3 className="mb-3 text-sm font-semibold">{title}</h3>
      {children}
    </div>
  )
}

export default function DashboardPage() {
  const [params] = useSearchParams()
  const [scope, setScope] = useState<ScopeValue>(() => (params.get('space') ? `c:${params.get('space')}` : 'all'))
  const [loaded, setLoaded] = useState(!!params.get('space'))
  useEffect(() => {
    if (loaded) return
    api('settings.get', { key: 'dashboard.scope' }).then((v) => { if (typeof v === 'string') setScope(v) }).finally(() => setLoaded(true))
  }, [loaded])
  const changeScope = (v: ScopeValue) => {
    setScope(v)
    api('settings.set', { key: 'dashboard.scope', value: v }).catch(() => {})
  }
  const { data } = useApiQuery('dashboard.get', { scope: toScope(scope) }, { enabled: loaded })
  const { data: tree } = useApiQuery('spaces.tree', {})
  const dark = useIsDark()
  const mode = dark ? 'dark' : 'light'
  const axis = dark ? '#a1a1aa' : '#71717a'
  const grid = dark ? '#27272a' : '#e4e4e7'
  const surface = dark ? '#09090b' : '#ffffff'
  const tooltipStyle = { background: surface, border: `1px solid ${grid}`, borderRadius: 6, fontSize: 12, color: dark ? '#e4e4e7' : '#18181b' }

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite'
  const weekLabel = (iso: string) => format(parseISO(iso), 'dd/MM', { locale: ptBR })

  return (
    <div className="flex-1 overflow-y-auto">
      <PageHeader title="Dashboard">
        <Select data-testid="dashboard-scope" value={scope} onChange={(e) => changeScope(e.target.value)}>
          <option value="all">Tudo</option>
          <option value="personal">Pessoal</option>
          <option value="professional">Profissional</option>
          <optgroup label="Espaço">
            {tree?.map((s) => <option key={s.company.id} value={`c:${s.company.id}`}>{s.company.name}</option>)}
          </optgroup>
          <optgroup label="Projeto">
            {allProjects(tree).map((p) => <option key={p.id} value={`p:${p.id}`}>{p.name}</option>)}
          </optgroup>
        </Select>
      </PageHeader>
      <div className="space-y-4 p-6">
        <div className="text-sm text-zinc-500">
          {greeting} — {format(new Date(), "EEEE, d 'de' MMMM 'de' yyyy", { locale: ptBR })}
        </div>
        {!data ? null : data.kpis.total === 0 ? (
          <EmptyState text="Nenhuma tarefa ainda. Crie um projeto no menu lateral (Espaços → +) e adicione cartões no quadro." />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Kpi id="total" label="Total de tarefas" value={data.kpis.total} />
              <Kpi id="todo" label="Pendentes" value={data.kpis.todo} />
              <Kpi id="inProgress" label="Em andamento" value={data.kpis.inProgress} />
              <Kpi id="done" label="Concluídas" value={data.kpis.done} />
              <Kpi id="overdue" label="Atrasadas" value={data.kpis.overdue} tone="danger" />
              <Kpi id="nearDue" label="Vencendo em breve" value={data.kpis.nearDue} tone="warn" />
              <Kpi id="activeProjects" label="Projetos ativos" value={data.kpis.activeProjects} />
              <Kpi id="companies" label="Empresas cadastradas" value={data.kpis.companies} />
            </div>
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              <TaskMiniList testId="list-overdue" title="Atrasadas" items={data.overdueList} empty="Nada atrasado. 🎉" />
              <TaskMiniList testId="list-neardue" title="Próximos vencimentos" items={data.nearDueList} empty="Nada vencendo nos próximos dias." />
            </div>
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              <ChartCard title="Carga de trabalho por espaço (tarefas abertas)">
                <ResponsiveContainer width="100%" height={Math.max(160, data.byCompany.length * 44 + 60)}>
                  <BarChart data={data.byCompany} layout="vertical" margin={{ left: 8, right: 16 }}>
                    <CartesianGrid horizontal={false} stroke={grid} />
                    <XAxis type="number" allowDecimals={false} stroke={axis} fontSize={12} />
                    <YAxis type="category" dataKey="name" width={110} stroke={axis} fontSize={12} />
                    <Tooltip contentStyle={tooltipStyle} cursor={{ fill: grid, opacity: 0.4 }} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    {[...PRIORITIES].reverse().map((p, i, arr) => (
                      <Bar key={p} dataKey={p} name={PRIORITY_LABELS[p]} stackId="a" fill={PRIO_RAMP[mode][p]} stroke={surface} strokeWidth={2} radius={i === arr.length - 1 ? [0, 4, 4, 0] : 0} barSize={20} />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
              <ChartCard title="Tarefas abertas por prioridade">
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={data.byPriority.map((d) => ({ ...d, label: PRIORITY_LABELS[d.priority] }))} margin={{ right: 16 }}>
                    <CartesianGrid vertical={false} stroke={grid} />
                    <XAxis dataKey="label" stroke={axis} fontSize={12} />
                    <YAxis allowDecimals={false} stroke={axis} fontSize={12} />
                    <Tooltip contentStyle={tooltipStyle} cursor={{ fill: grid, opacity: 0.4 }} formatter={(v) => [v, 'Tarefas']} />
                    <Bar dataKey="count" name="Tarefas" fill={SERIES[mode].created} radius={[4, 4, 0, 0]} barSize={36} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
              <ChartCard title="Produtividade — criadas × concluídas por semana">
                <ResponsiveContainer width="100%" height={240}>
                  <LineChart data={data.createdVsCompleted.map((w) => ({ ...w, label: weekLabel(w.weekStart) }))} margin={{ right: 16 }}>
                    <CartesianGrid vertical={false} stroke={grid} />
                    <XAxis dataKey="label" stroke={axis} fontSize={12} />
                    <YAxis allowDecimals={false} stroke={axis} fontSize={12} />
                    <Tooltip contentStyle={tooltipStyle} labelFormatter={(l) => `Semana de ${l}`} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Line type="monotone" dataKey="created" name="Criadas" stroke={SERIES[mode].created} strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 5 }} />
                    <Line type="monotone" dataKey="completed" name="Concluídas" stroke={SERIES[mode].completed} strokeWidth={2} strokeDasharray="5 3" dot={{ r: 4 }} activeDot={{ r: 5 }} />
                  </LineChart>
                </ResponsiveContainer>
              </ChartCard>
              <ChartCard title="Resumo por espaço">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-zinc-500">
                      <th className="pb-1 font-medium">Espaço</th>
                      {PRIORITIES.map((p) => <th key={p} className="pb-1 text-right font-medium">{PRIORITY_LABELS[p]}</th>)}
                      <th className="pb-1 text-right font-medium">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.byCompany.map((c) => (
                      <tr key={c.companyId} className="border-t border-zinc-100 dark:border-zinc-800">
                        <td className="py-1"><span className="flex items-center gap-2"><Dot color={c.color} size={8} />{c.name}</span></td>
                        {PRIORITIES.map((p) => <td key={p} className="py-1 text-right tabular-nums">{c[p]}</td>)}
                        <td className="py-1 text-right font-medium tabular-nums">{c.low + c.medium + c.high + c.urgent}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </ChartCard>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
