import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { useSearchParams } from 'react-router-dom'
import { DndContext, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent, type DragStartEvent } from '@dnd-kit/core'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { CopyPlus, ChevronLeft, ChevronRight, GripVertical, Plus, Search } from 'lucide-react'
import type { ApiMethods } from '@shared/api'
import type { TaskListItem } from '@shared/types'
import { addDays, getWeekRange, parseLocalDate, toLocalDate } from '@shared/dates'
import { daySummary, fromMinutes, roundTo15, toMinutes, addMinutes, type Workday } from '@shared/day'
import { Button, Dot, EmptyState, Input, PageHeader, PriorityBadge, Select } from '../../components/ui'
import { useApiQuery, useCall } from '../../lib/queries'
import { cx, formatShort } from '../../lib/format'
import { useToast } from '../../components/toast'
import { useOpenTask } from '../board/BoardView'
import { BlockForm, type BlockDraft } from './BlockForm'

type Block = ApiMethods['dayBlocks.list']['output'][number]
const HOUR_PX = 56
const PX_PER_MIN = HOUR_PX / 60
const DEFAULT_WORKDAY: Workday = { start: '08:00', end: '18:00' }

function fmtMinutes(m: number) {
  const h = Math.floor(m / 60)
  const r = m % 60
  return h ? `${h}h${r ? String(r).padStart(2, '0') : ''}` : `${r}min`
}

/** Assigns side-by-side lanes to overlapping blocks. */
function layoutLanes(blocks: Block[]): Map<number, { lane: number; lanes: number }> {
  const out = new Map<number, { lane: number; lanes: number }>()
  const sorted = [...blocks].sort((a, b) => toMinutes(a.startTime) - toMinutes(b.startTime) || toMinutes(b.endTime) - toMinutes(a.endTime))
  let cluster: { b: Block; lane: number }[] = []
  let clusterEnd = -1
  const flush = () => {
    const lanes = Math.max(1, ...cluster.map((c) => c.lane + 1))
    cluster.forEach((c) => out.set(c.b.id, { lane: c.lane, lanes }))
    cluster = []
  }
  for (const b of sorted) {
    const s = toMinutes(b.startTime)
    if (s >= clusterEnd && cluster.length) flush()
    const laneEnds: number[] = []
    cluster.forEach((c) => { laneEnds[c.lane] = Math.max(laneEnds[c.lane] ?? 0, toMinutes(c.b.endTime)) })
    let lane = laneEnds.findIndex((e) => e <= s)
    if (lane < 0) lane = laneEnds.length
    cluster.push({ b, lane })
    clusterEnd = Math.max(clusterEnd, toMinutes(b.endTime))
  }
  if (cluster.length) flush()
  return out
}

function BlockCard({ b, style, onEdit }: { b: Block; style: CSSProperties; onEdit: () => void }) {
  const { setNodeRef, attributes, listeners, transform, isDragging } = useDraggable({ id: `block:${b.id}`, data: { kind: 'block', block: b } })
  const call = useCall()
  const open = useOpenTask()
  const short = toMinutes(b.endTime) - toMinutes(b.startTime) <= 30
  const color = b.color ?? b.task?.companyColor ?? '#6366F1'
  return (
    <div
      ref={setNodeRef}
      data-testid={`day-block-${b.id}`}
      {...attributes}
      {...listeners}
      onClick={onEdit}
      className={cx('lift absolute cursor-grab overflow-hidden rounded-[5px] border text-[12px] shadow-[var(--shadow-1)]', isDragging && 'z-30 cursor-grabbing shadow-[var(--shadow-3)]', b.isDone && 'opacity-60')}
      style={{
        ...style,
        transform: transform ? `translate3d(0, ${transform.y}px, 0)` : undefined,
        background: `color-mix(in srgb, ${color} 10%, var(--surface))`,
        borderColor: `color-mix(in srgb, ${color} 35%, transparent)`
      }}
    >
      <div className={cx('flex h-full gap-2 px-2', short ? 'items-center py-0.5' : 'flex-col py-1.5')}>
        <div className="flex min-w-0 items-start gap-1.5">
          <input
            key={`${b.id}-${b.isDone}`}
            type="checkbox"
            className="mt-0.5 accent-emerald-600"
            aria-label={`Concluir ${b.displayTitle}`}
            defaultChecked={b.isDone}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => call('dayBlocks.setDone', { id: b.id, done: e.target.checked })}
          />
          <span className={cx('min-w-0 flex-1 truncate font-semibold', b.isDone && 'line-through')}>{b.displayTitle}</span>
          <span className="shrink-0 tabular-nums text-zinc-500">{b.startTime}–{b.endTime}</span>
        </div>
        {!short && (
          <div className="flex min-w-0 flex-wrap items-center gap-1.5 pl-5 text-[11px] text-zinc-600 dark:text-zinc-400">
            {b.task ? (
              <>
                <Dot color={b.task.companyColor} size={6} />
                <button className="truncate hover:underline" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); open(b.task!.id) }}>
                  {b.task.companyName} · {b.task.projectName}
                </button>
                <PriorityBadge priority={b.task.priority} />
              </>
            ) : (
              <span className="italic">Atividade</span>
            )}
            {b.note && <span className="truncate">· {b.note}</span>}
          </div>
        )}
      </div>
    </div>
  )
}

function Timeline({ date, blocks, workday, onCreate, onEdit, scrollRef }: { date: string; blocks: Block[]; workday: Workday; onCreate: (min: number) => void; onEdit: (b: Block) => void; scrollRef: React.RefObject<HTMLDivElement | null> }) {
  const { setNodeRef, isOver } = useDroppable({ id: 'timeline' })
  const lanes = useMemo(() => layoutLanes(blocks), [blocks])
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(t)
  }, [])
  const isToday = date === toLocalDate(now)
  const nowMin = now.getHours() * 60 + now.getMinutes()
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: Math.max(0, toMinutes(workday.start) * PX_PER_MIN - 24) })
  }, [date, workday.start, scrollRef])
  return (
    <div ref={scrollRef} className="surface relative min-h-0 flex-1 overflow-y-auto" data-testid="day-timeline">
      <div
        ref={setNodeRef}
        className={cx('relative ml-14 mr-3', isOver && 'bg-indigo-500/[.04]')}
        style={{ height: 24 * HOUR_PX }}
        onClick={(e) => {
          if (e.target !== e.currentTarget) return
          const y = e.nativeEvent.offsetY
          onCreate(Math.floor(y / PX_PER_MIN / 15) * 15)
        }}
      >
        <div className="pointer-events-none absolute inset-x-0 bg-indigo-500/[.035]" style={{ top: toMinutes(workday.start) * PX_PER_MIN, height: (toMinutes(workday.end) - toMinutes(workday.start)) * PX_PER_MIN }} />
        {Array.from({ length: 24 }, (_, h) => (
          <div key={h} className="pointer-events-none absolute inset-x-0 border-t border-[var(--line)]" style={{ top: h * HOUR_PX }}>
            <span className="absolute -left-12 -top-2 w-10 text-right text-[11px] tabular-nums text-zinc-400">{String(h).padStart(2, '0')}:00</span>
          </div>
        ))}
        {isToday && (
          <div className="pointer-events-none absolute inset-x-0 z-20 border-t-2 border-red-500" style={{ top: nowMin * PX_PER_MIN }}>
            <span className="absolute -left-1.5 -top-[5px] h-2 w-2 rounded-full bg-red-500" />
          </div>
        )}
        {blocks.map((b) => {
          const l = lanes.get(b.id) ?? { lane: 0, lanes: 1 }
          const top = toMinutes(b.startTime) * PX_PER_MIN
          const height = Math.max(22, (toMinutes(b.endTime) - toMinutes(b.startTime)) * PX_PER_MIN - 3)
          const width = 100 / l.lanes
          return <BlockCard key={b.id} b={b} onEdit={() => onEdit(b)} style={{ top: top + 1, height, left: `calc(${l.lane * width}% + 4px)`, width: `calc(${width}% - 8px)` }} />
        })}
      </div>
    </div>
  )
}

function AllocateItem({ t, onAllocate }: { t: TaskListItem; onAllocate: () => void }) {
  const { setNodeRef, attributes, listeners, transform, isDragging } = useDraggable({ id: `task:${t.id}`, data: { kind: 'task', task: t } })
  return (
    <div
      ref={setNodeRef}
      data-testid={`allocate-item-${t.id}`}
      className={cx('card flex items-center gap-2 p-2 text-[12px]', isDragging && 'z-50 shadow-[var(--shadow-3)]')}
      style={{ transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined, position: isDragging ? 'relative' : undefined }}
    >
      <button className="cursor-grab text-zinc-400" aria-label="Arrastar para a linha do tempo" {...attributes} {...listeners}><GripVertical size={14} /></button>
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium">{t.title}</div>
        <div className="flex items-center gap-1.5 truncate text-[11px] text-zinc-500">
          <Dot color={t.companyColor} size={6} />{t.projectName}
          {t.dueAt && <span className={cx(t.isOverdue ? 'font-semibold text-red-600' : '')}>· {formatShort(t.dueAt)}</span>}
          {t.scheduled && <span className="text-indigo-500">· programada</span>}
        </div>
      </div>
      <Button size="sm" data-testid={`allocate-btn-${t.id}`} onClick={onAllocate}>Alocar</Button>
    </div>
  )
}

function AllocatePanel({ date, onAllocate }: { date: string; onAllocate: (t: TaskListItem) => void }) {
  const [q, setQ] = useState('')
  const [companyId, setCompanyId] = useState('')
  const { data: tree } = useApiQuery('spaces.tree', {})
  const { data: tasks } = useApiQuery('tasks.query', { filter: { includeDone: false, text: q || undefined, companyIds: companyId ? [Number(companyId)] : undefined }, sort: 'due' })
  const week = getWeekRange(parseLocalDate(date), 1)
  const groups = useMemo(() => {
    const g: Record<string, TaskListItem[]> = { overdue: [], today: [], week: [], other: [] }
    for (const t of tasks ?? []) {
      const d = t.dueAt?.slice(0, 10)
      if (t.isOverdue) g.overdue.push(t)
      else if (d === date) g.today.push(t)
      else if (d && d >= week.start && d <= week.end) g.week.push(t)
      else g.other.push(t)
    }
    return g
  }, [tasks, date, week.start, week.end])
  const labels: [keyof typeof groups, string][] = [['overdue', 'Atrasadas'], ['today', 'Vencem neste dia'], ['week', 'Esta semana'], ['other', 'Todas abertas']]
  return (
    <aside className="surface flex w-80 shrink-0 flex-col overflow-hidden">
      <div className="space-y-2 border-b border-[var(--line)] p-3">
        <div className="text-sm font-semibold">Tarefas para alocar</div>
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-2.5 text-zinc-400" />
          <Input className="pl-8" placeholder="Buscar…" value={q} onChange={(e) => setQ(e.target.value)} data-testid="allocate-search" />
        </div>
        <Select className="w-full" value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
          <option value="">Todos os espaços</option>
          {tree?.map((s) => <option key={s.company.id} value={s.company.id}>{s.company.name}</option>)}
        </Select>
        <p className="text-[11px] text-zinc-500">Arraste para a linha do tempo ou clique em Alocar.</p>
      </div>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3">
        {labels.map(([k, label]) =>
          groups[k].length ? (
            <section key={k}>
              <h3 className={cx('section-title mb-1.5', k === 'overdue' && '!text-red-600')}>{label} <span className="font-normal normal-case tracking-normal text-zinc-400">{groups[k].length}</span></h3>
              <div className="space-y-1.5">{groups[k].slice(0, 60).map((t) => <AllocateItem key={t.id} t={t} onAllocate={() => onAllocate(t)} />)}</div>
            </section>
          ) : null
        )}
        {tasks && !tasks.length && <EmptyState text="Nenhuma tarefa aberta." />}
      </div>
    </aside>
  )
}

export default function MyDayPage() {
  const [params, setParams] = useSearchParams()
  const date = params.get('date') ?? toLocalDate(new Date())
  const setDate = (d: string) => { const p = new URLSearchParams(params); p.set('date', d); setParams(p) }
  const { data: blocks } = useApiQuery('dayBlocks.list', { date })
  const { data: wd } = useApiQuery('settings.get', { key: 'myDay.workday' })
  const workday = (wd && typeof wd === 'object' ? wd : DEFAULT_WORKDAY) as Workday
  const [draft, setDraft] = useState<BlockDraft | null>(null)
  const call = useCall()
  const toast = useToast()
  const scrollRef = useRef<HTMLDivElement>(null)
  const grab = useRef(0)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))
  const list = blocks ?? []
  const summary = daySummary(list, workday)
  const pct = summary.planned ? Math.round((summary.done / summary.planned) * 100) : 0

  const nextFree = (): number => {
    const free = summary.freeIntervals[0]
    return free ? toMinutes(free.start) : roundTo15(new Date().getHours() * 60 + new Date().getMinutes())
  }
  const startDraft = (min: number, taskId?: number) => {
    const s = Math.min(Math.max(0, min), 1425)
    setDraft({ date, startTime: fromMinutes(s), endTime: fromMinutes(Math.min(1440, s + 60)), taskId: taskId ?? null })
  }

  const minuteAt = (clientY: number) => {
    const el = scrollRef.current?.firstElementChild as HTMLElement | undefined
    if (!el) return 0
    const r = el.getBoundingClientRect()
    return roundTo15((clientY - r.top) / PX_PER_MIN)
  }
  const onDragStart = (e: DragStartEvent) => {
    const ev = e.activatorEvent as PointerEvent
    const node = document.querySelector(`[data-testid="day-block-${String(e.active.id).split(':')[1]}"]`)
    grab.current = e.active.data.current?.kind === 'block' && node ? ev.clientY - node.getBoundingClientRect().top : 0
  }
  const onDragEnd = async (e: DragEndEvent) => {
    if (e.over?.id !== 'timeline') return
    const ev = e.activatorEvent as PointerEvent
    const pointerY = ev.clientY + e.delta.y
    const start = Math.max(0, minuteAt(pointerY - grab.current))
    const kind = e.active.data.current?.kind
    try {
      if (kind === 'block') {
        const b = e.active.data.current!.block as Block
        if (fromMinutes(start) !== b.startTime) await call('dayBlocks.move', { id: b.id, date, startTime: fromMinutes(start) })
      } else if (kind === 'task') {
        const t = e.active.data.current!.task as TaskListItem
        const s = Math.min(start, 1380)
        await call('dayBlocks.create', { date, startTime: fromMinutes(s), endTime: fromMinutes(s + 60), taskId: t.id })
        toast.success(`"${t.title}" alocada às ${fromMinutes(s)}`)
      }
    } catch {
      /* toast already shown */
    }
  }

  const dateObj = parseLocalDate(date)
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader title={<>Meu Dia <span className="text-base font-medium text-zinc-500">{(() => { const t = format(dateObj, "EEEE, dd 'de' MMMM", { locale: ptBR }); return t.charAt(0).toUpperCase() + t.slice(1) })()}</span></>}>
        <Button aria-label="Dia anterior" data-testid="day-prev" onClick={() => setDate(toLocalDate(addDays(dateObj, -1)))}><ChevronLeft size={14} /></Button>
        <Button onClick={() => setDate(toLocalDate(new Date()))}>Hoje</Button>
        <Button aria-label="Próximo dia" data-testid="day-next" onClick={() => setDate(toLocalDate(addDays(dateObj, 1)))}><ChevronRight size={14} /></Button>
        <Input type="date" className="w-40" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} aria-label="Escolher data" />
        <Button
          onClick={async () => {
            const n = await call('dayBlocks.copyFromDay', { from: toLocalDate(addDays(dateObj, -1)), to: date })
            toast.success(n ? `${n} bloco(s) copiado(s) do dia anterior` : 'Nada novo para copiar do dia anterior')
          }}
        >
          <CopyPlus size={14} /> Copiar do dia anterior
        </Button>
        <Button variant="primary" data-testid="day-add" onClick={() => startDraft(nextFree())}><Plus size={14} /> Adicionar bloco</Button>
      </PageHeader>

      <div className="glass mx-6 mb-3 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-md px-4 py-2.5 text-sm">
        <div className="flex min-w-56 items-center gap-3" data-testid="day-progress">
          <span className="font-semibold tabular-nums">{summary.done}/{summary.planned} concluídas</span>
          <div className="h-1.5 w-32 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800"><div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} /></div>
          <span className="text-xs text-zinc-500">{pct}%</span>
        </div>
        <div><span className="text-zinc-500">Planejado:</span> <span className="font-semibold">{fmtMinutes(summary.plannedMinutes)}</span></div>
        <div><span className="text-zinc-500">Livre no expediente ({workday.start}–{workday.end}):</span> <span className="font-semibold">{fmtMinutes(summary.freeMinutes)}</span></div>
        {!!summary.freeIntervals.length && (
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <span className="text-zinc-500">Intervalos livres:</span>
            {summary.freeIntervals.map((f) => (
              <button key={f.start} className="rounded-[3px] bg-emerald-500/10 px-1.5 py-0.5 font-medium text-emerald-700 hover:bg-emerald-500/20 dark:text-emerald-300" onClick={() => startDraft(toMinutes(f.start))}>
                {f.start}–{f.end}
              </button>
            ))}
          </div>
        )}
      </div>

      <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
        <div className="flex min-h-0 flex-1 gap-3 px-6 pb-4">
          <Timeline
            date={date}
            blocks={list}
            workday={workday}
            scrollRef={scrollRef}
            onCreate={(m) => startDraft(m)}
            onEdit={(b) => setDraft({ date, startTime: b.startTime, endTime: b.endTime, block: b })}
          />
          <AllocatePanel date={date} onAllocate={(t) => { const s = nextFree(); setDraft({ date, startTime: fromMinutes(s), endTime: addMinutes(fromMinutes(s), 60), taskId: t.id }) }} />
        </div>
      </DndContext>
      {draft && <BlockForm key={`${draft.block?.id ?? 'new'}-${draft.startTime}-${draft.taskId ?? ''}`} draft={draft} onClose={() => setDraft(null)} />}
    </div>
  )
}
