import { Clock } from 'lucide-react'
import type { TaskListItem } from '@shared/types'
import { dueBadge } from '@shared/week'
import { PriorityBadge } from '../../components/ui'
import { useCall } from '../../lib/queries'
import { cx } from '../../lib/format'
import { useOpenTask } from '../board/BoardView'
import { StatusChip } from '../all-tasks/AllTasksPage'

const BADGE = {
  overdue: { text: 'Atrasada', cls: 'bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-300' },
  today: { text: 'Vence hoje', cls: 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300' },
  tomorrow: { text: 'Vence amanhã', cls: 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300' }
}

export function WeekCard({ t, today, inline = false }: { t: TaskListItem; today: string; inline?: boolean }) {
  const call = useCall()
  const open = useOpenTask()
  const badge = dueBadge(t, today)
  const done = t.status === 'done'
  const time = t.dueAt && t.dueAt.length > 10 ? t.dueAt.slice(11, 16) : null
  return (
    <div
      data-testid={`week-item-${t.id}`}
      className={cx('card group flex gap-2.5 p-2.5', inline ? 'items-center' : 'flex-col', done && 'opacity-70', badge === 'overdue' && 'ring-1 ring-red-200 dark:ring-red-900/60')}
    >
      <div className={cx('flex min-w-0 items-start gap-2', inline && 'flex-1 items-center')}>
        <input
          key={`${t.id}-${t.status}`}
          type="checkbox"
          className="mt-0.5 accent-emerald-600"
          aria-label={`Concluir ${t.title}`}
          defaultChecked={done}
          onChange={(e) => call('tasks.setStatus', { id: t.id, status: e.target.checked ? 'done' : 'todo' })}
        />
        <button className={cx('min-w-0 flex-1 text-left text-[13px] font-medium leading-snug hover:underline', done && 'text-zinc-400 line-through', inline && 'truncate')} onClick={() => open(t.id)}>
          {t.title}
        </button>
      </div>
      <div className={cx('flex flex-wrap items-center gap-1.5', !inline && 'pl-5')}>
        <StatusChip status={t.status} />
        <PriorityBadge priority={t.priority} />
        {badge && <span className={cx('rounded-[3px] px-1.5 py-0.5 text-[11px] font-semibold', BADGE[badge].cls)}>{BADGE[badge].text}</span>}
        {time && <span className="text-[11px] font-medium text-zinc-500">{time}</span>}
        {t.scheduled && <span title="Programada no Meu Dia" className="text-indigo-500"><Clock size={12} /></span>}
      </div>
      <div className={cx('flex items-center gap-1.5 truncate text-[11px] text-zinc-500', !inline && 'pl-5', inline && 'w-56 shrink-0 justify-end')}>
        <span className="h-1.5 w-1.5 shrink-0 rounded-[2px]" style={{ background: t.companyColor }} />
        <span className="truncate" title={`${t.companyName} · ${t.projectName}`}>{inline ? `${t.companyName} · ${t.projectName}` : t.projectName}</span>
      </div>
    </div>
  )
}
