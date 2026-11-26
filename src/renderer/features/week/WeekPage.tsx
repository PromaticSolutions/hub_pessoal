import { useMemo, useState } from 'react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Columns3, List } from 'lucide-react'
import type { TaskListItem } from '@shared/types'
import { addDays, getWeekRange, parseLocalDate, toLocalDate } from '@shared/dates'
import { bucketByWeek, groupChronological } from '@shared/week'
import { Button, EmptyState, PageHeader } from '../../components/ui'
import { useApiQuery } from '../../lib/queries'
import { api } from '../../lib/api'
import { cx } from '../../lib/format'
import { TaskFilters } from './TaskFilters'
import { usePersistedFilter } from './usePersistedFilter'
import { QuickCreateTask } from './QuickCreateTask'
import { WeekCard } from './WeekCard'

type Mode = 'columns' | 'list'
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

export default function WeekPage() {
  const [anchor, setAnchor] = useState(() => new Date())
  const [filter, setFilter, ready] = usePersistedFilter('week.filters')
  const [creating, setCreating] = useState(false)
  const { data: settings } = useApiQuery('settings.all', {})
  const [modeLocal, setModeLocal] = useState<Mode | null>(null)
  const [noDueLocal, setNoDueLocal] = useState<boolean | null>(null)
  const mode: Mode = modeLocal ?? (settings?.['week.mode'] === 'list' ? 'list' : 'columns')
  const showNoDue = noDueLocal ?? settings?.['week.showNoDue'] !== false
  const weekStartsOn = (settings?.weekStartsOn as 0 | 1) ?? 1
  const week = getWeekRange(anchor, weekStartsOn)
  const today = toLocalDate(new Date())
  const { data: tasks } = useApiQuery('tasks.query', { filter: { ...filter, dueTo: week.end }, sort: 'due' }, { enabled: ready })
  const { data: noDue } = useApiQuery('tasks.query', { filter: { ...filter, noDueOnly: true, includeDone: false }, sort: 'priority' }, { enabled: ready && showNoDue })
  const buckets = useMemo(() => bucketByWeek(tasks ?? [], week.days, new Date()), [tasks, week.days])
  const groups = useMemo(() => groupChronological(tasks ?? [], week.days, today), [tasks, week.days, today])
  const weekCount = week.days.reduce((n, d) => n + (buckets.byDay[d]?.length ?? 0), 0)
  const doneCount = week.days.reduce((n, d) => n + (buckets.byDay[d]?.filter((t) => t.status === 'done').length ?? 0), 0)

  const setMode = (m: Mode) => { setModeLocal(m); api('settings.set', { key: 'week.mode', value: m }).catch(() => {}) }
  const toggleNoDue = () => { setNoDueLocal(!showNoDue); api('settings.set', { key: 'week.showNoDue', value: !showNoDue }).catch(() => {}) }

  const columns: { key: string; title: string; sub?: string; items: TaskListItem[]; today?: boolean; danger?: boolean; muted?: boolean }[] = [
    ...(buckets.overdue.length ? [{ key: 'overdue', title: 'Atrasadas', items: buckets.overdue, danger: true }] : []),
    ...week.days.map((d) => ({
      key: d,
      title: cap(format(parseLocalDate(d), 'EEEE', { locale: ptBR })),
      sub: format(parseLocalDate(d), "dd 'de' MMM", { locale: ptBR }),
      items: buckets.byDay[d] ?? [],
      today: d === today,
      muted: d < today
    })),
    ...(showNoDue ? [{ key: 'nodue', title: 'Sem prazo', items: noDue?.slice(0, 50) ?? [] }] : [])
  ]

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader title="Minha semana">
        <span className="text-sm text-zinc-500">{format(parseLocalDate(week.start), 'dd/MM')} – {format(parseLocalDate(week.end), 'dd/MM/yyyy')} · {doneCount}/{weekCount} concluídas</span>
        <div className="flex overflow-hidden rounded-[5px] border border-[var(--line-strong)]">
          <button data-testid="week-mode-columns" onClick={() => setMode('columns')} className={cx('flex items-center gap-1 px-2.5 py-1.5 text-sm', mode === 'columns' ? 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-300' : 'hover:bg-zinc-100 dark:hover:bg-zinc-800')}><Columns3 size={14} /> Colunas</button>
          <button data-testid="week-mode-list" onClick={() => setMode('list')} className={cx('flex items-center gap-1 px-2.5 py-1.5 text-sm', mode === 'list' ? 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-300' : 'hover:bg-zinc-100 dark:hover:bg-zinc-800')}><List size={14} /> Lista</button>
        </div>
        <Button onClick={() => setAnchor(addDays(anchor, -7))} aria-label="Semana anterior">‹</Button>
        <Button onClick={() => setAnchor(new Date())}>Esta semana</Button>
        <Button onClick={() => setAnchor(addDays(anchor, 7))} aria-label="Próxima semana">›</Button>
        <Button variant="primary" data-testid="week-new-task" onClick={() => setCreating(true)}>Nova tarefa</Button>
      </PageHeader>
      <div className="glass mx-6 mb-3 flex flex-wrap items-center gap-3 rounded-md px-3 py-2">
        <TaskFilters value={filter} onChange={setFilter} />
        <label className="ml-auto flex items-center gap-1 text-xs text-zinc-500"><input type="checkbox" checked={showNoDue} onChange={toggleNoDue} /> mostrar sem prazo</label>
      </div>

      {mode === 'columns' ? (
        <div className="grid min-h-0 flex-1 auto-cols-[minmax(190px,1fr)] grid-flow-col gap-2.5 overflow-x-auto px-6 pb-4">
          {columns.map((c) => (
            <section key={c.key} data-testid={`week-col-${c.key}`} className={cx('lane flex min-h-0 flex-col', c.today && 'bg-indigo-500/[.07] ring-1 ring-indigo-500/40', c.muted && 'opacity-80')}>
              <header className="flex items-baseline justify-between gap-2 px-2.5 pb-1.5 pt-2.5">
                <div className="min-w-0">
                  <div className={cx('truncate text-[13px] font-semibold', c.danger && 'text-red-600', c.today && 'text-indigo-700 dark:text-indigo-300')}>{c.title}</div>
                  {c.sub && <div className="text-[11px] text-zinc-500">{c.sub}{c.today && ' · hoje'}</div>}
                </div>
                <span className={cx('rounded-[3px] px-1.5 text-[11px] font-semibold', c.items.length ? 'bg-white/80 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300' : 'text-zinc-400')}>{c.items.length}</span>
              </header>
              <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-2 pb-2">
                {c.items.map((t) => <WeekCard key={t.id} t={t} today={today} />)}
                {!c.items.length && <div className="px-1 py-3 text-center text-[11px] text-zinc-400">Livre</div>}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 pb-6" data-testid="week-list">
          {!groups.length && !(showNoDue && noDue?.length) && <EmptyState text="Nenhuma tarefa com vencimento nesta semana." />}
          {groups.map((g) => (
            <section key={g.key} data-testid={`week-group-${g.key}`}>
              <h2 className={cx('section-title mb-2 flex items-center gap-2', g.key === 'overdue' && '!text-red-600', g.label === 'Hoje' && '!text-indigo-600')}>
                {g.label} <span className="font-normal normal-case tracking-normal text-zinc-400">{g.items.length}</span>
              </h2>
              <div className="space-y-1.5">{g.items.map((t) => <WeekCard key={t.id} t={t} today={today} inline />)}</div>
            </section>
          ))}
          {showNoDue && !!noDue?.length && (
            <section data-testid="week-group-nodue">
              <h2 className="section-title mb-2">Sem prazo <span className="font-normal normal-case tracking-normal text-zinc-400">{noDue.length}</span></h2>
              <div className="space-y-1.5">{noDue.slice(0, 50).map((t) => <WeekCard key={t.id} t={t} today={today} inline />)}</div>
            </section>
          )}
        </div>
      )}
      <QuickCreateTask open={creating} onClose={() => setCreating(false)} />
    </div>
  )
}
