import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  closestCorners,
  DndContext,
  DragOverlay,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent
} from '@dnd-kit/core'
import { horizontalListSortingStrategy, SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useQueryClient } from '@tanstack/react-query'
import { CheckSquare, MessageSquare, MoreHorizontal, Paperclip, Plus } from 'lucide-react'
import type { CardSummary, Column, ColumnCategory, Priority } from '@shared/types'
import { CATEGORIES, CATEGORY_LABELS, PRIORITIES, PRIORITY_LABELS } from '@shared/constants'
import { Button, Input, Menu, Modal, PriorityBadge, Select, usePrompt } from '../../components/ui'
import { useApiQuery, useCall } from '../../lib/queries'
import { api } from '../../lib/api'
import { cx, formatShort } from '../../lib/format'
import { useToast } from '../../components/toast'
import { computeColumnDrop, computeDrop } from './dnd'

type Filters = { text: string; labelId: number | null; priority: Priority | ''; archived: boolean }

export function useOpenTask() {
  const [params, setParams] = useSearchParams()
  return (id: number) => {
    const p = new URLSearchParams(params)
    p.set('task', String(id))
    setParams(p)
  }
}

export function TaskCardFace({ card, dragging }: { card: CardSummary; dragging?: boolean }) {
  return (
    <div
      className={cx(
        'card p-2.5 text-sm',
        dragging && 'card-dragging',
        card.archivedAt && 'opacity-60',
        card.status === 'done' && 'text-zinc-500'
      )}
    >
      {card.labels.length > 0 && (
        <div className="mb-1 flex flex-wrap gap-1">
          {card.labels.map((l) => (
            <span key={l.id} className="rounded-[3px] px-1.5 py-px text-[10px] font-semibold text-white" style={{ background: l.color }}>
              {l.name}
            </span>
          ))}
        </div>
      )}
      <div className={cx('break-words', card.status === 'done' && 'line-through')}>{card.title}</div>
      <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-zinc-500">
        <PriorityBadge priority={card.priority} />
        {card.dueAt && <span className={cx(card.isOverdue && 'font-semibold text-red-600')}>{formatShort(card.dueAt)}</span>}
        {card.checklistTotal > 0 && (
          <span className={cx('flex items-center gap-0.5', card.checklistDone === card.checklistTotal && 'text-emerald-600')}>
            <CheckSquare size={12} /> {card.checklistDone}/{card.checklistTotal}
          </span>
        )}
        {card.commentCount > 0 && <span className="flex items-center gap-0.5"><MessageSquare size={12} /> {card.commentCount}</span>}
        {card.attachmentCount > 0 && <span className="flex items-center gap-0.5"><Paperclip size={12} /> {card.attachmentCount}</span>}
        {card.archivedAt && <span className="italic">arquivado</span>}
      </div>
    </div>
  )
}

function SortableCard({ card, onOpen }: { card: CardSummary; onOpen: () => void }) {
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({ id: `card:${card.id}`, data: { type: 'card', card } })
  return (
    <div
      ref={setNodeRef}
      data-testid={`card-${card.id}`}
      style={{ transform: CSS.Translate.toString(transform), transition, opacity: isDragging ? 0.3 : 1 }}
      {...attributes}
      {...listeners}
      onClick={onOpen}
      className="cursor-pointer"
    >
      <TaskCardFace card={card} />
    </div>
  )
}

function QuickAdd({ columnId, open, setOpen }: { columnId: number; open: boolean; setOpen: (v: boolean) => void }) {
  const [title, setTitle] = useState('')
  const call = useCall()
  if (!open)
    return (
      <button data-testid={`quick-add-open-${columnId}`} onClick={() => setOpen(true)} className="flex w-full items-center gap-1 rounded-[5px] px-2 py-1.5 text-left text-xs text-zinc-500 transition hover:bg-white hover:shadow-[0_1px_3px_rgba(16,24,40,.08)] dark:hover:bg-zinc-800">
        <Plus size={14} /> Adicionar cartão
      </button>
    )
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault()
        if (!title.trim()) return
        await call('tasks.create', { columnId, title })
        setTitle('')
      }}
    >
      <Input
        data-testid={`quick-add-${columnId}`}
        autoFocus
        placeholder="Título do cartão… (Enter cria, Esc fecha)"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
        onBlur={() => !title && setOpen(false)}
      />
    </form>
  )
}

function DeleteColumnDialog({ column, columns, count, onClose }: { column: Column; columns: Column[]; count: number; onClose: () => void }) {
  const others = columns.filter((c) => c.id !== column.id)
  const [dest, setDest] = useState<string>(others[0] ? String(others[0].id) : 'delete')
  const call = useCall()
  return (
    <Modal open onClose={onClose} title={`Excluir a coluna "${column.name}"`}>
      <div className="space-y-3 text-sm">
        {count > 0 ? (
          <>
            <p>Esta coluna tem {count} cartão(ões). O que fazer com eles?</p>
            <Select data-testid="delete-column-dest" className="w-full" value={dest} onChange={(e) => setDest(e.target.value)}>
              {others.map((c) => <option key={c.id} value={c.id}>Mover para "{c.name}"</option>)}
              <option value="delete">Excluir os cartões permanentemente</option>
            </Select>
          </>
        ) : (
          <p>A coluna está vazia.</p>
        )}
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Cancelar</Button>
          <Button
            data-testid="delete-column-ok"
            variant="danger"
            onClick={async () => {
              await call('columns.delete', { id: column.id, moveTasksTo: count > 0 && dest !== 'delete' ? Number(dest) : null })
              onClose()
            }}
          >
            Excluir coluna
          </Button>
        </div>
      </div>
    </Modal>
  )
}

function BoardColumn({
  column,
  cards,
  columns,
  quickOpen,
  setQuickOpen
}: {
  column: Column
  cards: CardSummary[]
  columns: Column[]
  quickOpen: boolean
  setQuickOpen: (v: boolean) => void
}) {
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({ id: `col:${column.id}`, data: { type: 'column', column } })
  const { setNodeRef: setBodyRef, isOver } = useDroppable({ id: `colbody:${column.id}`, data: { type: 'colbody', columnId: column.id } })
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(column.name)
  const [deleting, setDeleting] = useState(false)
  const call = useCall()
  const openTask = useOpenTask()
  useEffect(() => setName(column.name), [column.name])
  const saveName = () => {
    setEditing(false)
    if (name.trim() && name !== column.name) call('columns.update', { id: column.id, name })
    else setName(column.name)
  }
  return (
    <div
      ref={setNodeRef}
      data-testid={`column-${column.id}`}
      style={{ transform: CSS.Translate.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }}
      className="lane flex max-h-full w-72 shrink-0 flex-col"
    >
      <div className="flex items-center gap-1 px-2 pt-2" {...attributes} {...listeners}>
        {editing ? (
          <Input
            data-testid={`column-name-input-${column.id}`}
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={saveName}
            onKeyDown={(e) => { if (e.key === 'Enter') saveName(); if (e.key === 'Escape') { setName(column.name); setEditing(false) } }}
            onPointerDown={(e) => e.stopPropagation()}
          />
        ) : (
          <div className="flex-1 cursor-grab truncate px-1 text-sm font-semibold" onDoubleClick={() => setEditing(true)} data-testid={`column-title-${column.id}`}>
            {column.name} <span className="font-normal text-zinc-400">{cards.length}</span>
          </div>
        )}
        <span className="rounded-[3px] bg-white/70 px-1.5 text-[10px] font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">{CATEGORY_LABELS[column.category]}</span>
        <div onPointerDown={(e) => e.stopPropagation()}>
          <Menu
            trigger={<button data-testid={`column-menu-${column.id}`} className="rounded p-1 hover:bg-zinc-200 dark:hover:bg-zinc-800"><MoreHorizontal size={14} /></button>}
            items={[
              { label: 'Renomear', onClick: () => setEditing(true) },
              ...CATEGORIES.filter((c) => c !== column.category).map((c) => ({ label: `Tipo: ${CATEGORY_LABELS[c]}`, onClick: () => call('columns.update', { id: column.id, category: c as ColumnCategory }) })),
              'separator' as const,
              { label: 'Excluir coluna', danger: true, testId: `column-delete-${column.id}`, onClick: () => setDeleting(true) }
            ]}
          />
        </div>
      </div>
      <div ref={setBodyRef} className={cx('flex min-h-12 flex-1 flex-col gap-2 overflow-y-auto p-2 transition-colors', isOver && 'bg-indigo-100/60 dark:bg-indigo-950/30')}>
        <SortableContext items={cards.map((c) => `card:${c.id}`)} strategy={verticalListSortingStrategy}>
          {cards.map((c) => <SortableCard key={c.id} card={c} onOpen={() => openTask(c.id)} />)}
        </SortableContext>
      </div>
      <div className="p-2 pt-0">
        <QuickAdd columnId={column.id} open={quickOpen} setOpen={setQuickOpen} />
      </div>
      {deleting && <DeleteColumnDialog column={column} columns={columns} count={cards.length} onClose={() => setDeleting(false)} />}
    </div>
  )
}

export function BoardView({ boardId }: { boardId: number }) {
  const [filters, setFilters] = useState<Filters>({ text: '', labelId: null, priority: '', archived: false })
  const queryInput = { id: boardId, includeArchived: filters.archived }
  const { data } = useApiQuery('boards.get', queryInput)
  const { data: labels } = useApiQuery('labels.list', {})
  const qc = useQueryClient()
  const toast = useToast()
  const call = useCall()
  const prompt = usePrompt()
  const [activeCard, setActiveCard] = useState<CardSummary | null>(null)
  const [quickCol, setQuickCol] = useState<number | null>(null)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))
  const rootRef = useRef<HTMLDivElement>(null)

  const columns = data?.columns ?? []
  const filtered = useMemo(() => {
    const t = filters.text.trim().toLowerCase()
    return (data?.cards ?? []).filter(
      (c) =>
        (!t || c.title.toLowerCase().includes(t)) &&
        (!filters.labelId || c.labels.some((l) => l.id === filters.labelId)) &&
        (!filters.priority || c.priority === filters.priority)
    )
  }, [data, filters])
  const byColumn = useMemo(() => {
    const m: Record<number, CardSummary[]> = {}
    for (const col of columns) m[col.id] = []
    for (const c of filtered) (m[c.columnId] ??= []).push(c)
    return m
  }, [filtered, columns])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName
      if (e.key.toLowerCase() === 'n' && !e.ctrlKey && !e.metaKey && !['INPUT', 'TEXTAREA', 'SELECT'].includes(tag) && !new URLSearchParams(location.hash.split('?')[1]).get('task')) {
        e.preventDefault()
        if (columns[0]) setQuickCol(columns[0].id)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [columns])

  if (!data) return <div className="p-6 text-sm text-zinc-500">Carregando…</div>

  const setLocal = (fn: (d: NonNullable<typeof data>) => NonNullable<typeof data>) =>
    qc.setQueryData(['boards.get', queryInput], (old: typeof data) => (old ? fn(old) : old))

  const onDragStart = (e: DragStartEvent) => {
    document.body.classList.add('is-dragging')
    if (e.active.data.current?.type === 'card') setActiveCard(e.active.data.current.card as CardSummary)
  }

  const onDragEnd = async (e: DragEndEvent) => {
    document.body.classList.remove('is-dragging')
    setActiveCard(null)
    const { active, over } = e
    if (!over) return
    const aType = active.data.current?.type
    if (aType === 'column') {
      const activeId = Number(String(active.id).split(':')[1])
      const overCol = over.data.current?.type === 'column' ? (over.data.current.column as Column) : over.data.current?.type === 'colbody' ? columns.find((c) => c.id === over.data.current!.columnId) : columns.find((c) => c.id === (over.data.current?.card as CardSummary | undefined)?.columnId)
      if (!overCol || overCol.id === activeId) return
      const ids = columns.map((c) => c.id)
      const to = ids.indexOf(overCol.id)
      const drop = computeColumnDrop(ids, activeId, to)
      const newOrder = ids.filter((i) => i !== activeId)
      newOrder.splice(to, 0, activeId)
      setLocal((d) => ({ ...d, columns: newOrder.map((i) => d.columns.find((c) => c.id === i)!) }))
      try {
        await api('columns.move', { id: activeId, ...drop })
      } catch (err) {
        toast.error((err as Error).message)
      }
      qc.invalidateQueries()
      return
    }
    if (aType !== 'card') return
    const card = active.data.current!.card as CardSummary
    let columnId: number
    let index: number
    if (over.data.current?.type === 'card') {
      const overCard = over.data.current.card as CardSummary
      columnId = overCard.columnId
      const list = byColumn[columnId] ?? []
      if (overCard.id === card.id) return
      // sortable semantics (arrayMove): the card takes the over card's index
      index = list.findIndex((c) => c.id === overCard.id)
    } else if (over.data.current?.type === 'colbody') {
      columnId = over.data.current.columnId as number
      index = (byColumn[columnId] ?? []).filter((c) => c.id !== card.id).length
    } else if (over.data.current?.type === 'column') {
      columnId = (over.data.current.column as Column).id
      index = (byColumn[columnId] ?? []).filter((c) => c.id !== card.id).length
    } else return
    const drop = computeDrop(byColumn, card.id, columnId, index)
    if (drop.columnId === card.columnId) {
      const list = byColumn[columnId]
      const cur = list.findIndex((c) => c.id === card.id)
      if (list[cur - 1]?.id === (drop.beforeId ?? undefined) && list[cur + 1]?.id === (drop.afterId ?? undefined)) return
    }
    // optimistic: rebuild order of affected column
    setLocal((d) => {
      const target = columns.find((c) => c.id === columnId)!
      const rest = d.cards.filter((c) => c.id !== card.id)
      const moved = { ...card, columnId, status: target.category }
      const before = drop.beforeId != null ? rest.findIndex((c) => c.id === drop.beforeId) + 1 : drop.afterId != null ? rest.findIndex((c) => c.id === drop.afterId) : rest.length
      rest.splice(before, 0, moved)
      return { ...d, cards: rest }
    })
    try {
      await api('tasks.move', { id: card.id, ...drop })
    } catch (err) {
      toast.error((err as Error).message)
    }
    qc.invalidateQueries()
  }

  const addColumn = async () => {
    const name = await prompt({ title: 'Nova coluna', confirmLabel: 'Criar' })
    if (name) await call('columns.create', { boardId, name, category: 'todo', afterId: columns.at(-1)?.id ?? null })
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col" ref={rootRef} data-testid={`board-${boardId}`}>
      <div className="flex flex-wrap items-center gap-2 px-6 pb-2">
        <Input className="w-56" placeholder="Filtrar cartões…" value={filters.text} onChange={(e) => setFilters({ ...filters, text: e.target.value })} />
        <Select value={filters.priority} onChange={(e) => setFilters({ ...filters, priority: e.target.value as Priority | '' })}>
          <option value="">Todas as prioridades</option>
          {PRIORITIES.map((p) => <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>)}
        </Select>
        <Select value={filters.labelId ?? ''} onChange={(e) => setFilters({ ...filters, labelId: e.target.value ? Number(e.target.value) : null })}>
          <option value="">Todas as etiquetas</option>
          {labels?.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
        </Select>
        <label className="flex items-center gap-1 text-xs text-zinc-500">
          <input type="checkbox" checked={filters.archived} onChange={(e) => setFilters({ ...filters, archived: e.target.checked })} /> mostrar arquivados
        </label>
      </div>
      <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => { document.body.classList.remove('is-dragging'); setActiveCard(null) }}>
        <div className="flex min-h-0 flex-1 items-start gap-3 overflow-x-auto px-6 pb-4">
          <SortableContext items={columns.map((c) => `col:${c.id}`)} strategy={horizontalListSortingStrategy}>
            {columns.map((col) => (
              <BoardColumn
                key={col.id}
                column={col}
                cards={byColumn[col.id] ?? []}
                columns={columns}
                quickOpen={quickCol === col.id}
                setQuickOpen={(v) => setQuickCol(v ? col.id : null)}
              />
            ))}
          </SortableContext>
          <button data-testid="add-column" onClick={addColumn} className="flex w-60 shrink-0 items-center gap-1 rounded-md border border-dashed border-zinc-300 px-3 py-2 text-sm text-zinc-500 transition hover:bg-white hover:shadow-[var(--shadow-1)] dark:border-zinc-700 dark:hover:bg-zinc-900">
            <Plus size={14} /> Nova coluna
          </button>
        </div>
        <DragOverlay>{activeCard ? <div className="w-68"><TaskCardFace card={activeCard} dragging /></div> : null}</DragOverlay>
      </DndContext>
    </div>
  )
}
