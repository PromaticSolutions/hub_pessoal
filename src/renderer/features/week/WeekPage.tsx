import { useMemo, useState } from 'react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import type { TaskListItem } from '@shared/types'
import { addDays, getWeekRange, parseLocalDate, toLocalDate } from '@shared/dates'
import { bucketByWeek } from '@shared/week'
import { Button, Dot, PageHeader, PriorityBadge } from '../../components/ui'
import { useApiQuery, useCall } from '../../lib/queries'
import { cx } from '../../lib/format'
import { useOpenTask } from '../board/BoardView'
import { TaskFilters } from './TaskFilters'
import { usePersistedFilter } from './usePersistedFilter'
import { QuickCreateTask } from './QuickCreateTask'

function WeekItem({ t }: { t: TaskListItem }) {
  const call = useCall()
  const open = useOpenTask()
  return (
    <div data-testid={`week-item-${t.id}`} className="card p-2 text-sm">
      <div className="flex items-start gap-2">
        <input
          key={`${t.id}-${t.status}`}
          type="checkbox"
          className="mt-0.5"
          title="Concluir"
          defaultChecked={t.status === 'done'}
          onChange={(e) => call('tasks.setStatus', { id: t.id, status: e.target.checked ? 'done' : 'todo' })}
        />
        <button className={cx('min-w-0 flex-1 text-left', t.status === 'done' && 'text-zinc-400 line-through')} onClick={() => open(t.id)}>
          {t.title}
        </button>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-1.5 pl-5 text-[11px] text-zinc-500">
        <PriorityBadge priority={t.priority} />
        {t.dueAt && t.dueAt.length > 10 && <span>{t.dueAt.slice(11, 16)}</span>}
        {t.isOverdue && <span className="font-semibold text-red-600">{format(parseLocalDate(t.dueAt!), 'dd/MM')}</span>}
        <span className="flex items-center gap-1 truncate"><Dot color={t.companyColor} size={6} />{t.projectName}</span>
      </div>
    </div>
  )
}

export default function WeekPage() {
  const [anchor, setAnchor] = useState(() => new Date())
  const [filter, setFilter, ready] = usePersistedFilter('week.filters')
  const [creating, setCreating] = useState(false)
  const { data: settings } = useApiQuery('settings.all', {})
  const weekStartsOn = (settings?.weekStartsOn as 0 | 1) ?? 1
  const week = getWeekRange(anchor, weekStartsOn)
  const { data: tasks } = useApiQuery('tasks.query', { filter: { ...filter, dueTo: week.end }, sort: 'due' }, { enabled: ready })
  const buckets = useMemo(() => bucketByWeek(tasks ?? [], week.days, new Date()), [tasks, week.days])
  const today = toLocalDate(new Date())
  const { data: noDue } = useApiQuery('tasks.query', { filter: { ...filter, noDueOnly: true, includeDone: false }, sort: 'priority' }, { enabled: ready })

  const columns: { key: string; title: string; sub?: string; items: TaskListItem[]; highlight?: boolean; danger?: boolean }[] = [
    { key: 'overdue', title: 'Atrasadas', items: buckets.overdue, danger: true },
    ...week.days.map((d) => ({
      key: d,
      title: format(parseLocalDate(d), 'EEEE', { locale: ptBR }),
      sub: format(parseLocalDate(d), "dd 'de' MMM", { locale: ptBR }),
      items: buckets.byDay[d] ?? [],
      highlight: d === today
    }))
  ]

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader title="Minha semana">
        <Button onClick={() => setAnchor(addDays(anchor, -7))}>‹</Button>
        <Button onClick={() => setAnchor(new Date())}>Esta semana</Button>
        <Button onClick={() => setAnchor(addDays(anchor, 7))}>›</Button>
        <span className="text-sm text-zinc-500">
          {format(parseLocalDate(week.start), 'dd/MM')} – {format(parseLocalDate(week.end), 'dd/MM/yyyy')}
        </span>
        <Button variant="primary" data-testid="week-new-task" onClick={() => setCreating(true)}>Nova tarefa</Button>
      </PageHeader>
      <div className="px-6 py-2"><TaskFilters value={filter} onChange={setFilter} /></div>
      <div className="flex min-h-0 flex-1 gap-2 overflow-x-auto px-6 pb-4">
        {columns.map((c) => (
          <div key={c.key} data-testid={`week-col-${c.key}`} className={cx('lane flex w-52 shrink-0 flex-col', c.highlight && 'ring-2 ring-indigo-500/70')}>
            <div className="px-2 py-2">
              <div className={cx('text-sm font-semibold capitalize', c.danger && 'text-red-600')}>{c.title} <span className="font-normal text-zinc-400">{c.items.length}</span></div>
              {c.sub && <div className="text-xs text-zinc-500">{c.sub}</div>}
            </div>
            <div className="flex flex-1 flex-col gap-1.5 overflow-y-auto px-2 pb-2">
              {c.items.map((t) => <WeekItem key={t.id} t={t} />)}
            </div>
          </div>
        ))}
        <div className="flex w-52 shrink-0 flex-col rounded-md border border-dashed border-zinc-300 dark:border-zinc-700">
          <div className="px-2 py-2 text-sm font-semibold text-zinc-500">Sem prazo <span className="font-normal">{noDue?.length ?? 0}</span></div>
          <div className="flex flex-1 flex-col gap-1.5 overflow-y-auto px-2 pb-2">
            {noDue?.slice(0, 50).map((t) => <WeekItem key={t.id} t={t} />)}
          </div>
        </div>
      </div>
      <QuickCreateTask open={creating} onClose={() => setCreating(false)} />
    </div>
  )
}
