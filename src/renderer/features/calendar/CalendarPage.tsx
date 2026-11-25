import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { groupItemsByDay, monthGrid, splitTimed, type CalendarItem } from '@shared/calendar'
import { addDays, getWeekRange, parseLocalDate, toLocalDate } from '@shared/dates'
import { Button, PageHeader } from '../../components/ui'
import { useApiQuery, useCall } from '../../lib/queries'
import { cx } from '../../lib/format'
import { useOpenTask } from '../board/BoardView'
import { TaskFilters } from '../week/TaskFilters'
import { usePersistedFilter } from '../week/usePersistedFilter'
import { QuickCreateTask } from '../week/QuickCreateTask'

type View = 'month' | 'week' | 'day'
const HOUR_PX = 44

function Item({ it, compact }: { it: CalendarItem; compact?: boolean }) {
  const open = useOpenTask()
  const t = it.task
  const done = t.status === 'done'
  return (
    <button
      data-testid={`cal-item-${it.kind}-${t.id}`}
      onClick={(e) => { e.stopPropagation(); open(t.id) }}
      title={`${it.kind === 'start' ? 'Início: ' : ''}${t.title} — ${t.companyName} › ${t.projectName}`}
      className={cx(
        'flex w-full items-center gap-1 truncate rounded px-1 py-0.5 text-left text-[11px] hover:brightness-95',
        it.kind === 'start' ? 'bg-transparent text-zinc-500' : 'bg-white shadow-[0_1px_2px_rgba(16,24,40,.08)] dark:bg-zinc-800',
        done && 'line-through opacity-50',
        t.isOverdue && it.kind === 'due' && 'text-red-600'
      )}
    >
      <span className="h-1.5 w-1.5 shrink-0 rounded-[2px]" style={{ background: t.companyColor }} />
      {it.kind === 'start' && <span>▶</span>}
      {t.isOverdue && it.kind === 'due' && <span className="font-bold">!</span>}
      {it.time && !compact && <span className="text-zinc-400">{it.time}</span>}
      <span className="truncate">{t.title}</span>
    </button>
  )
}

function MonthView({ anchor, weekStartsOn, byDay, onCreate, onDay }: { anchor: Date; weekStartsOn: 0 | 1; byDay: Record<string, CalendarItem[]>; onCreate: (d: string) => void; onDay: (d: string) => void }) {
  const grid = monthGrid(anchor, weekStartsOn)
  const month = anchor.getMonth()
  const today = toLocalDate(new Date())
  return (
    <div className="flex min-h-0 flex-1 flex-col px-6 pb-4">
      <div className="grid grid-cols-7 text-center text-xs font-medium text-zinc-500">
        {grid[0].map((d) => <div key={d} className="py-1 capitalize">{format(parseLocalDate(d), 'EEE', { locale: ptBR })}</div>)}
      </div>
      <div className="surface grid flex-1 grid-cols-7 grid-rows-6 overflow-hidden">
        {grid.flat().map((d) => {
          const items = byDay[d] ?? []
          const inMonth = parseLocalDate(d).getMonth() === month
          return (
            <div
              key={d}
              data-testid={`cal-day-${d}`}
              onClick={() => onCreate(d)}
              className={cx('min-h-0 cursor-pointer overflow-hidden border-b border-r border-[var(--line)] p-1', !inMonth && 'bg-zinc-50 dark:bg-zinc-900/60', 'hover:bg-indigo-50/40 dark:hover:bg-indigo-950/20')}
            >
              <div className={cx('mb-0.5 text-xs', d === today ? 'inline-block rounded-[3px] bg-indigo-600 px-1.5 font-semibold text-white' : inMonth ? '' : 'text-zinc-400')}>{parseLocalDate(d).getDate()}</div>
              <div className="space-y-0.5">
                {items.slice(0, 3).map((it) => <Item key={`${it.kind}${it.task.id}`} it={it} compact />)}
                {items.length > 3 && (
                  <button className="text-[11px] text-zinc-500 hover:underline" onClick={(e) => { e.stopPropagation(); onDay(d) }}>+{items.length - 3} mais</button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function TimeGrid({ days, byDay, onCreate }: { days: string[]; byDay: Record<string, CalendarItem[]>; onCreate: (d: string) => void }) {
  const scroller = useRef<HTMLDivElement>(null)
  useEffect(() => { scroller.current?.scrollTo({ top: 7 * HOUR_PX }) }, [])
  const today = toLocalDate(new Date())
  return (
    <div className="surface mx-6 mb-4 flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="grid border-b border-[var(--line)]" style={{ gridTemplateColumns: `56px repeat(${days.length}, 1fr)` }}>
        <div />
        {days.map((d) => (
          <div key={d} className={cx('px-1 py-1 text-center text-xs capitalize', d === today && 'font-semibold text-indigo-600')}>
            {format(parseLocalDate(d), "EEE dd/MM", { locale: ptBR })}
          </div>
        ))}
        <div className="py-1 text-right text-[10px] text-zinc-400">dia todo</div>
        {days.map((d) => (
          <div key={d} className="min-h-8 space-y-0.5 border-l border-zinc-200 p-1 dark:border-zinc-800" onClick={() => onCreate(d)}>
            {splitTimed(byDay[d] ?? []).allDay.map((it) => <Item key={`${it.kind}${it.task.id}`} it={it} />)}
          </div>
        ))}
      </div>
      <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto">
        <div className="relative grid" style={{ gridTemplateColumns: `56px repeat(${days.length}, 1fr)`, height: 24 * HOUR_PX }}>
          <div>
            {Array.from({ length: 24 }, (_, h) => (
              <div key={h} className="pr-2 text-right text-[10px] text-zinc-400" style={{ height: HOUR_PX }}>{String(h).padStart(2, '0')}:00</div>
            ))}
          </div>
          {days.map((d) => (
            <div key={d} className="relative border-l border-zinc-200 dark:border-zinc-800" onClick={() => onCreate(d)}>
              {Array.from({ length: 24 }, (_, h) => <div key={h} className="border-b border-zinc-100 dark:border-zinc-900" style={{ height: HOUR_PX }} />)}
              {splitTimed(byDay[d] ?? []).timed.map((it, i) => {
                const [hh, mm] = it.time!.split(':').map(Number)
                return (
                  <div key={`${it.kind}${it.task.id}`} className="absolute right-1" style={{ top: (hh + mm / 60) * HOUR_PX, left: 4 + (i % 3) * 6 }}>
                    <Item it={it} />
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default function CalendarPage() {
  const [params, setParams] = useSearchParams()
  const { data: settings } = useApiQuery('settings.all', {})
  const weekStartsOn = ((settings?.weekStartsOn as number) ?? 1) as 0 | 1
  const showStarts = settings?.showStartMarkers !== false
  const savedView = settings?.['calendar.view'] as View | undefined
  const view: View = (params.get('view') as View) || savedView || 'month'
  const [anchor, setAnchor] = useState(() => new Date())
  const [filter, setFilter, ready] = usePersistedFilter('calendar.filters')
  const [createDate, setCreateDate] = useState<string | null>(null)
  const call = useCall()

  const range = useMemo(() => {
    if (view === 'month') { const g = monthGrid(anchor, weekStartsOn); return { from: g[0][0], to: g[5][6], days: g.flat() } }
    if (view === 'week') { const w = getWeekRange(anchor, weekStartsOn); return { from: w.start, to: w.end, days: w.days } }
    const d = toLocalDate(anchor)
    return { from: d, to: d, days: [d] }
  }, [view, anchor, weekStartsOn])
  const { data: items } = useApiQuery('calendar.items', { from: range.from, to: range.to, filter }, { enabled: ready })
  const byDay = useMemo(() => groupItemsByDay((items ?? []).filter((i) => showStarts || i.kind === 'due')), [items, showStarts])

  const setView = (v: View) => {
    const p = new URLSearchParams(params)
    p.set('view', v)
    setParams(p)
    call('settings.set', { key: 'calendar.view', value: v })
  }
  const step = (dir: -1 | 1) => {
    if (view === 'month') setAnchor(new Date(anchor.getFullYear(), anchor.getMonth() + dir, 1))
    else setAnchor(addDays(anchor, dir * (view === 'week' ? 7 : 1)))
  }
  const label =
    view === 'month'
      ? format(anchor, 'MMMM yyyy', { locale: ptBR })
      : view === 'week'
        ? `${format(parseLocalDate(range.from), 'dd/MM')} – ${format(parseLocalDate(range.to), 'dd/MM/yyyy')}`
        : format(anchor, "EEEE, dd 'de' MMMM yyyy", { locale: ptBR })

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader title="Calendário">
        <Button onClick={() => step(-1)}>‹</Button>
        <Button onClick={() => setAnchor(new Date())}>Hoje</Button>
        <Button onClick={() => step(1)}>›</Button>
        <span data-testid="cal-label" className="min-w-40 text-sm font-medium capitalize">{label}</span>
        <div className="flex overflow-hidden rounded-md border border-zinc-300 dark:border-zinc-700">
          {(['month', 'week', 'day'] as View[]).map((v) => (
            <button key={v} data-testid={`cal-view-${v}`} onClick={() => setView(v)} className={cx('px-3 py-1 text-sm', view === v ? 'bg-zinc-200 font-medium dark:bg-zinc-800' : 'hover:bg-zinc-100 dark:hover:bg-zinc-900')}>
              {v === 'month' ? 'Mês' : v === 'week' ? 'Semana' : 'Dia'}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-1 text-xs text-zinc-500">
          <input type="checkbox" checked={showStarts} onChange={(e) => call('settings.set', { key: 'showStartMarkers', value: e.target.checked })} /> mostrar inícios
        </label>
      </PageHeader>
      <div className="px-6 py-2"><TaskFilters value={filter} onChange={setFilter} /></div>
      {view === 'month' ? (
        <MonthView anchor={anchor} weekStartsOn={weekStartsOn} byDay={byDay} onCreate={setCreateDate} onDay={(d) => { setAnchor(parseLocalDate(d)); setView('day') }} />
      ) : (
        <TimeGrid days={range.days} byDay={byDay} onCreate={setCreateDate} />
      )}
      <QuickCreateTask open={!!createDate} initialDue={createDate} onClose={() => setCreateDate(null)} />
    </div>
  )
}
