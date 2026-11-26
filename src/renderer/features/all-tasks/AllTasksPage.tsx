import { useEffect, useMemo, useRef, useState } from 'react'
import { LayoutGrid, List } from 'lucide-react'
import type { ColumnCategory, TaskFilter, TaskListItem, TaskSort } from '@shared/types'
import { CATEGORY_LABELS } from '@shared/constants'
import { Button, Dot, EmptyState, Input, PageHeader, PriorityBadge, Select } from '../../components/ui'
import { useApiQuery } from '../../lib/queries'
import { api } from '../../lib/api'
import { cx, formatShort } from '../../lib/format'
import { useOpenTask } from '../board/BoardView'
import { TaskFilters } from '../week/TaskFilters'
import { usePersistedFilter } from '../week/usePersistedFilter'
import { QuickCreateTask } from '../week/QuickCreateTask'
import { BulkBar } from './BulkBar'

const PAGE = 200

export function StatusChip({ status }: { status: ColumnCategory }) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1 rounded-[3px] px-1.5 py-0.5 text-[11px] font-medium',
        status === 'todo' && 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300',
        status === 'in_progress' && 'bg-sky-100 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300',
        status === 'done' && 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
      )}
    >
      <span className={cx('h-1.5 w-1.5 rounded-full', status === 'todo' && 'bg-zinc-400', status === 'in_progress' && 'bg-sky-500', status === 'done' && 'bg-emerald-500')} />
      {CATEGORY_LABELS[status]}
    </span>
  )
}

type Filters = TaskFilter & { sort?: TaskSort }

export default function AllTasksPage() {
  const [filter, setFilter, ready] = usePersistedFilter('allTasks.filters') as unknown as [Filters, (f: Filters) => void, boolean]
  const { data: viewSetting } = useApiQuery('settings.get', { key: 'allTasks.view' })
  const [view, setView] = useState<'list' | 'cards' | null>(null)
  const currentView = view ?? (viewSetting === 'cards' ? 'cards' : 'list')
  const [limit, setLimit] = useState(PAGE)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [creating, setCreating] = useState(false)
  const lastClicked = useRef<number | null>(null)
  const { data: labels } = useApiQuery('labels.list', {})
  const { sort = 'due', ...taskFilter } = filter
  const { data: tasks } = useApiQuery('tasks.query', { filter: taskFilter, sort }, { enabled: ready })
  const open = useOpenTask()
  const all = tasks ?? []
  const visible = all.slice(0, limit)

  useEffect(() => {
    // Drop selections that are no longer in the result set.
    if (!tasks) return
    const ids = new Set(tasks.map((t) => t.id))
    setSelected((s) => {
      const next = new Set([...s].filter((id) => ids.has(id)))
      return next.size === s.size ? s : next
    })
  }, [tasks])

  const changeView = (v: 'list' | 'cards') => {
    setView(v)
    api('settings.set', { key: 'allTasks.view', value: v }).catch(() => {})
  }
  const toggle = (id: number, shift: boolean) => {
    setSelected((s) => {
      const next = new Set(s)
      if (shift && lastClicked.current != null) {
        const ids = visible.map((t) => t.id)
        const [a, b] = [ids.indexOf(lastClicked.current), ids.indexOf(id)].sort((x, y) => x - y)
        if (a >= 0 && b >= 0) ids.slice(a, b + 1).forEach((x) => next.add(x))
      } else if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
    lastClicked.current = id
  }
  const allVisibleSelected = visible.length > 0 && visible.every((t) => selected.has(t.id))
  const set = (patch: Partial<Filters>) => setFilter({ ...filter, ...patch })
  const counts = useMemo(() => ({ overdue: all.filter((t) => t.isOverdue).length, noDue: all.filter((t) => !t.dueAt).length }), [all])

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader title="Todas as Tarefas">
        <div className="flex overflow-hidden rounded-[5px] border border-[var(--line-strong)]">
          <button data-testid="all-view-list" aria-label="Ver em lista" onClick={() => changeView('list')} className={cx('flex items-center gap-1 px-2.5 py-1.5 text-sm', currentView === 'list' ? 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-300' : 'hover:bg-zinc-100 dark:hover:bg-zinc-800')}>
            <List size={14} /> Lista
          </button>
          <button data-testid="all-view-cards" aria-label="Ver em cards" onClick={() => changeView('cards')} className={cx('flex items-center gap-1 px-2.5 py-1.5 text-sm', currentView === 'cards' ? 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-300' : 'hover:bg-zinc-100 dark:hover:bg-zinc-800')}>
            <LayoutGrid size={14} /> Cards
          </button>
        </div>
        <Button variant="primary" onClick={() => setCreating(true)}>Nova tarefa</Button>
      </PageHeader>

      <div className="glass mx-6 mb-3 space-y-2 rounded-md px-3 py-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <Input data-testid="all-search" className="w-64" placeholder="Pesquisar por título…" value={filter.text ?? ''} onChange={(e) => set({ text: e.target.value || undefined })} />
          <TaskFilters value={taskFilter} onChange={(f) => setFilter({ ...f, sort })} />
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500">
          <Select data-testid="all-status" value={filter.statuses?.[0] ?? ''} onChange={(e) => set({ statuses: e.target.value ? [e.target.value as ColumnCategory] : undefined })}>
            <option value="">Todos os status</option>
            <option value="todo">A fazer</option>
            <option value="in_progress">Em andamento</option>
            <option value="done">Concluído</option>
          </Select>
          <Select value={filter.labelIds?.[0] ?? ''} onChange={(e) => set({ labelIds: e.target.value ? [Number(e.target.value)] : undefined })}>
            <option value="">Todas as etiquetas</option>
            {labels?.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </Select>
          <span>vence de</span>
          <Input type="date" className="w-36" value={filter.dueFrom ?? ''} onChange={(e) => set({ dueFrom: e.target.value || undefined })} />
          <span>até</span>
          <Input type="date" className="w-36" value={filter.dueTo ?? ''} onChange={(e) => set({ dueTo: e.target.value || undefined })} />
          <span className="ml-2">criada de</span>
          <Input type="date" className="w-36" value={filter.createdFrom ?? ''} onChange={(e) => set({ createdFrom: e.target.value || undefined })} />
          <span>até</span>
          <Input type="date" className="w-36" value={filter.createdTo ?? ''} onChange={(e) => set({ createdTo: e.target.value || undefined })} />
          <label className="flex items-center gap-1"><input type="checkbox" checked={!!filter.overdueOnly} onChange={(e) => set({ overdueOnly: e.target.checked || undefined })} /> só atrasadas ({counts.overdue})</label>
          <label className="flex items-center gap-1"><input type="checkbox" checked={!!filter.noDueOnly} onChange={(e) => set({ noDueOnly: e.target.checked || undefined })} /> sem prazo</label>
          <label className="flex items-center gap-1"><input type="checkbox" checked={!!filter.includeArchived} onChange={(e) => set({ includeArchived: e.target.checked || undefined })} /> incluir arquivadas</label>
          <span className="ml-auto">ordenar por</span>
          <Select data-testid="all-sort" value={sort} onChange={(e) => set({ sort: e.target.value as TaskSort })}>
            <option value="due">Vencimento</option>
            <option value="priority">Prioridade</option>
            <option value="status">Status</option>
            <option value="created">Criação</option>
            <option value="updated">Última alteração</option>
          </Select>
        </div>
      </div>

      <div className="flex items-center gap-3 px-6 pb-2 text-xs text-zinc-500">
        <span data-testid="all-count">{all.length} tarefa(s)</span>
        {allVisibleSelected && all.length > visible.length && selected.size < all.length && (
          <button className="text-indigo-600 hover:underline" onClick={() => setSelected(new Set(all.map((t) => t.id)))}>Selecionar todas as {all.length} filtradas</button>
        )}
      </div>

      <div className={cx('min-h-0 flex-1 overflow-y-auto px-6', selected.size > 0 ? 'pb-24' : 'pb-6')}>
        {!all.length ? (
          <EmptyState text="Nenhuma tarefa com esses filtros." />
        ) : currentView === 'list' ? (
          <div className="surface overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--line)] text-left text-xs text-zinc-500">
                  <th className="w-10 py-2 pl-3">
                    <input type="checkbox" aria-label="Selecionar todas as visíveis" checked={allVisibleSelected} onChange={(e) => setSelected(e.target.checked ? new Set([...selected, ...visible.map((t) => t.id)]) : new Set())} />
                  </th>
                  <th className="py-2 font-medium">Tarefa</th>
                  <th className="py-2 font-medium">Espaço</th>
                  <th className="py-2 font-medium">Projeto</th>
                  <th className="py-2 font-medium">Status</th>
                  <th className="py-2 font-medium">Prioridade</th>
                  <th className="py-2 pr-3 text-right font-medium">Vencimento</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((t) => (
                  <tr key={t.id} data-testid={`all-row-${t.id}`} className={cx('border-b border-[var(--line)] last:border-0 transition-colors', selected.has(t.id) ? 'bg-indigo-500/[.06]' : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/40', t.archivedAt && 'opacity-60')}>
                    <td className="py-2 pl-3">
                      <input type="checkbox" data-testid={`all-check-${t.id}`} aria-label={`Selecionar ${t.title}`} checked={selected.has(t.id)} onChange={() => {}} onClick={(e) => toggle(t.id, e.shiftKey)} />
                    </td>
                    <td className="max-w-[420px] py-2">
                      <button className={cx('truncate text-left hover:underline', t.status === 'done' && 'text-zinc-400 line-through')} onClick={() => open(t.id)}>{t.title}</button>
                    </td>
                    <td className="py-2"><span className="flex items-center gap-1.5 text-xs"><Dot color={t.companyColor} size={8} />{t.companyName}</span></td>
                    <td className="py-2 text-xs text-zinc-600 dark:text-zinc-400">{t.projectName}</td>
                    <td className="py-2"><StatusChip status={t.status} /></td>
                    <td className="py-2"><PriorityBadge priority={t.priority} /></td>
                    <td className={cx('py-2 pr-3 text-right text-xs', t.isOverdue ? 'font-semibold text-red-600' : t.isNearDue ? 'text-amber-600' : 'text-zinc-500')}>{t.dueAt ? formatShort(t.dueAt) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3">
            {visible.map((t) => <TaskGridCard key={t.id} t={t} selected={selected.has(t.id)} onToggle={(shift) => toggle(t.id, shift)} onOpen={() => open(t.id)} />)}
          </div>
        )}
        {all.length > visible.length && (
          <div className="py-4 text-center">
            <Button onClick={() => setLimit((l) => l + PAGE)}>Carregar mais ({all.length - visible.length} restantes)</Button>
          </div>
        )}
      </div>

      {selected.size > 0 && <BulkBar ids={[...selected]} onDone={() => setSelected(new Set())} />}
      <QuickCreateTask open={creating} onClose={() => setCreating(false)} />
    </div>
  )
}

function TaskGridCard({ t, selected, onToggle, onOpen }: { t: TaskListItem; selected: boolean; onToggle: (shift: boolean) => void; onOpen: () => void }) {
  return (
    <div data-testid={`all-card-${t.id}`} className={cx('card flex flex-col gap-2 p-3', selected && 'ring-2 ring-indigo-500/60', t.archivedAt && 'opacity-60')}>
      <div className="flex items-start gap-2">
        <input type="checkbox" className="mt-0.5" aria-label={`Selecionar ${t.title}`} checked={selected} onChange={() => {}} onClick={(e) => onToggle(e.shiftKey)} />
        <button className={cx('min-w-0 flex-1 text-left text-sm font-medium hover:underline', t.status === 'done' && 'text-zinc-400 line-through')} onClick={onOpen}>{t.title}</button>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <StatusChip status={t.status} />
        <PriorityBadge priority={t.priority} />
        {t.dueAt && <span className={cx('text-[11px]', t.isOverdue ? 'font-semibold text-red-600' : t.isNearDue ? 'text-amber-600' : 'text-zinc-500')}>{formatShort(t.dueAt)}</span>}
      </div>
      <div className="flex items-center gap-1.5 text-[11px] text-zinc-500"><Dot color={t.companyColor} size={6} />{t.companyName} · {t.projectName}</div>
    </div>
  )
}
