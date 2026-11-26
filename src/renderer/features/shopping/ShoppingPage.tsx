import { useMemo, useState } from 'react'
import { ExternalLink, LayoutGrid, List, Pencil, ShoppingCart, Trash2 } from 'lucide-react'
import type { ApiMethods } from '@shared/api'
import type { Priority } from '@shared/types'
import { PRIORITIES, PRIORITY_LABELS } from '@shared/constants'
import { formatBRL, parseMoneyToCents, parseQuantity } from '@shared/money'
import { Button, EmptyState, Field, Input, Modal, PageHeader, PriorityBadge, Select, Textarea, useConfirm } from '../../components/ui'
import { useApiQuery, useCall } from '../../lib/queries'
import { api } from '../../lib/api'
import { cx } from '../../lib/format'
import { useToast } from '../../components/toast'

type Item = ApiMethods['shopping.list']['output'][number]
type Filter = 'pending' | 'bought' | 'all'

const fmtQty = (q: number) => (Number.isInteger(q) ? String(q) : String(q).replace('.', ','))
const lineTotal = (i: Item) => (i.priceCents == null ? null : Math.round(i.priceCents * i.quantity))

function ItemDialog({ item, onClose }: { item: Item; onClose: () => void }) {
  const { data: categories } = useApiQuery('shopping.categories', {})
  const call = useCall()
  const toast = useToast()
  const [f, setF] = useState({
    name: item.name,
    notes: item.notes,
    quantity: fmtQty(item.quantity),
    unit: item.unit,
    category: item.category,
    price: item.priceCents == null ? '' : (item.priceCents / 100).toFixed(2).replace('.', ','),
    url: item.url ?? '',
    priority: item.priority
  })
  const set = (k: keyof typeof f, v: string) => setF((s) => ({ ...s, [k]: v }))
  const save = async () => {
    const priceCents = parseMoneyToCents(f.price)
    const quantity = parseQuantity(f.quantity)
    if (Number.isNaN(priceCents)) return toast.error('Preço inválido. Use, por exemplo, 12,50.')
    if (!(quantity > 0)) return toast.error('Quantidade inválida.')
    await call('shopping.update', { id: item.id, name: f.name, notes: f.notes, quantity, unit: f.unit, category: f.category, priceCents, url: f.url || null, priority: f.priority as Priority })
    onClose()
  }
  return (
    <Modal open onClose={onClose} title="Editar item" testId="shopping-dialog">
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); save() }}>
        <Field label="Produto *"><Input data-testid="shopping-name" value={f.name} onChange={(e) => set('name', e.target.value)} /></Field>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Quantidade"><Input data-testid="shopping-qty" value={f.quantity} onChange={(e) => set('quantity', e.target.value)} /></Field>
          <Field label="Unidade"><Input placeholder="un, kg, L…" value={f.unit} onChange={(e) => set('unit', e.target.value)} /></Field>
          <Field label="Preço unitário (R$)"><Input data-testid="shopping-price" inputMode="decimal" placeholder="0,00" value={f.price} onChange={(e) => set('price', e.target.value)} /></Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Categoria">
            <Input data-testid="shopping-category" list="shopping-categories" value={f.category} onChange={(e) => set('category', e.target.value)} placeholder="Mercado, Casa…" />
            <datalist id="shopping-categories">{categories?.map((c) => <option key={c} value={c} />)}</datalist>
          </Field>
          <Field label="Prioridade">
            <Select className="w-full" value={f.priority} onChange={(e) => set('priority', e.target.value)}>
              {PRIORITIES.map((p) => <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>)}
            </Select>
          </Field>
        </div>
        <Field label="Link do produto"><Input placeholder="https://…" value={f.url} onChange={(e) => set('url', e.target.value)} /></Field>
        <Field label="Observação"><Textarea rows={2} value={f.notes} onChange={(e) => set('notes', e.target.value)} /></Field>
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Cancelar</Button>
          <Button type="submit" variant="primary" data-testid="shopping-save" disabled={!f.name.trim()}>Salvar</Button>
        </div>
      </form>
    </Modal>
  )
}

function Row({ i, onEdit, card }: { i: Item; onEdit: () => void; card?: boolean }) {
  const call = useCall()
  const confirm = useConfirm()
  const bought = i.status === 'bought'
  const total = lineTotal(i)
  const actions = (
    <div className="flex shrink-0 items-center gap-1 text-zinc-400">
      {i.url && <button title="Abrir link" className="rounded p-1 hover:text-indigo-600" onClick={() => api('system.openExternal', { url: i.url! })}><ExternalLink size={14} /></button>}
      <button title="Editar" data-testid={`shopping-edit-${i.id}`} className="rounded p-1 hover:text-zinc-700" onClick={onEdit}><Pencil size={14} /></button>
      <button
        title="Excluir"
        className="rounded p-1 hover:text-red-600"
        onClick={async () => (await confirm({ title: `Excluir "${i.name}"?`, danger: true, confirmLabel: 'Excluir' })) && call('shopping.delete', { id: i.id })}
      >
        <Trash2 size={14} />
      </button>
    </div>
  )
  const check = (
    <input
      key={`${i.id}-${i.status}`}
      type="checkbox"
      data-testid={`shopping-check-${i.id}`}
      className="h-4 w-4 accent-emerald-600"
      aria-label={bought ? `Desmarcar ${i.name}` : `Marcar ${i.name} como comprado`}
      defaultChecked={bought}
      onChange={(e) => call('shopping.setBought', { id: i.id, bought: e.target.checked })}
    />
  )
  if (card)
    return (
      <div data-testid={`shopping-item-${i.id}`} className={cx('card flex flex-col gap-2 p-3', bought && 'opacity-60')}>
        <div className="flex items-start gap-2">
          {check}
          <div className={cx('min-w-0 flex-1 text-sm font-semibold', bought && 'line-through')}>{i.name}</div>
          {actions}
        </div>
        <div className="flex flex-wrap items-center gap-1.5 pl-6 text-xs text-zinc-500">
          <span>{fmtQty(i.quantity)} {i.unit}</span>
          {i.category && <span className="rounded-[3px] bg-zinc-100 px-1.5 py-0.5 dark:bg-zinc-800">{i.category}</span>}
          <PriorityBadge priority={i.priority} />
          <span className="ml-auto font-semibold text-zinc-800 dark:text-zinc-200">{total == null ? '—' : formatBRL(total)}</span>
        </div>
        {i.notes && <div className="pl-6 text-xs text-zinc-500">{i.notes}</div>}
      </div>
    )
  return (
    <div data-testid={`shopping-item-${i.id}`} className={cx('flex items-center gap-3 border-b border-[var(--line)] px-3 py-2 text-sm last:border-0 hover:bg-zinc-50 dark:hover:bg-zinc-800/40', bought && 'opacity-60')}>
      {check}
      <div className="min-w-0 flex-1">
        <div className={cx('truncate font-medium', bought && 'line-through')}>{i.name}</div>
        {i.notes && <div className="truncate text-xs text-zinc-500">{i.notes}</div>}
      </div>
      <span className="w-20 text-right text-xs text-zinc-500">{fmtQty(i.quantity)} {i.unit || 'un'}</span>
      <span className="w-28 truncate text-xs text-zinc-500">{i.category || '—'}</span>
      <PriorityBadge priority={i.priority} />
      <span className="w-24 text-right text-xs text-zinc-500">{i.priceCents == null ? '—' : formatBRL(i.priceCents)}</span>
      <span className="w-24 text-right font-semibold tabular-nums">{total == null ? '—' : formatBRL(total)}</span>
      {actions}
    </div>
  )
}

export default function ShoppingPage() {
  const { data: saved } = useApiQuery('settings.get', { key: 'shopping.filter' })
  const [filterLocal, setFilterLocal] = useState<Filter | null>(null)
  const filter: Filter = filterLocal ?? (saved === 'bought' || saved === 'all' ? saved : 'pending')
  const [category, setCategory] = useState('')
  const [grouped, setGrouped] = useState(true)
  const [view, setView] = useState<'list' | 'cards'>('list')
  const [quick, setQuick] = useState('')
  const [editing, setEditing] = useState<Item | null>(null)
  const { data: items } = useApiQuery('shopping.list', { status: filter, category: category || undefined })
  const { data: totals } = useApiQuery('shopping.totals', {})
  const { data: categories } = useApiQuery('shopping.categories', {})
  const call = useCall()
  const list = items ?? []
  const groups = useMemo(() => {
    if (!grouped) return [{ key: '', items: list }]
    const m = new Map<string, Item[]>()
    for (const i of list) m.set(i.category || 'Sem categoria', [...(m.get(i.category || 'Sem categoria') ?? []), i])
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([key, items]) => ({ key, items }))
  }, [list, grouped])
  const changeFilter = (f: Filter) => { setFilterLocal(f); api('settings.set', { key: 'shopping.filter', value: f }).catch(() => {}) }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader title={<><ShoppingCart size={20} className="text-emerald-600" /> Lista de Compras</>}>
        <div className="flex overflow-hidden rounded-[5px] border border-[var(--line-strong)]">
          <button onClick={() => setView('list')} className={cx('flex items-center gap-1 px-2.5 py-1.5 text-sm', view === 'list' ? 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-300' : 'hover:bg-zinc-100 dark:hover:bg-zinc-800')}><List size={14} /> Lista</button>
          <button onClick={() => setView('cards')} className={cx('flex items-center gap-1 px-2.5 py-1.5 text-sm', view === 'cards' ? 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-300' : 'hover:bg-zinc-100 dark:hover:bg-zinc-800')}><LayoutGrid size={14} /> Cards</button>
        </div>
      </PageHeader>
      <div className="mx-6 mb-3 grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className="surface p-4">
          <div className="text-xs font-medium text-zinc-500">Total estimado pendente</div>
          <div data-testid="shopping-total" className="mt-1 text-2xl font-bold tabular-nums">{formatBRL(totals?.pendingCents ?? 0)}</div>
          {!!totals?.pendingWithoutPrice && <div className="mt-0.5 text-xs text-amber-600">{totals.pendingWithoutPrice} item(ns) sem preço</div>}
        </div>
        <div className="surface p-4">
          <div className="text-xs font-medium text-zinc-500">Comprado neste mês</div>
          <div data-testid="shopping-month" className="mt-1 text-2xl font-bold tabular-nums">{formatBRL(totals?.boughtThisMonthCents ?? 0)}</div>
        </div>
        <form
          className="surface flex flex-col justify-center gap-1.5 p-4"
          onSubmit={async (e) => {
            e.preventDefault()
            if (!quick.trim()) return
            await call('shopping.quickAdd', { text: quick })
            setQuick('')
          }}
        >
          <div className="text-xs font-medium text-zinc-500">Adicionar rápido</div>
          <Input data-testid="shopping-quick" placeholder='Ex.: "Café 2" e Enter' value={quick} onChange={(e) => setQuick(e.target.value)} />
        </form>
      </div>
      <div className="glass mx-6 mb-3 flex flex-wrap items-center gap-2 rounded-md px-3 py-2">
        <div className="flex overflow-hidden rounded-[5px] border border-[var(--line-strong)] text-sm">
          {(['pending', 'bought', 'all'] as Filter[]).map((f) => (
            <button key={f} data-testid={`shopping-filter-${f}`} onClick={() => changeFilter(f)} className={cx('px-3 py-1.5', filter === f ? 'bg-indigo-500/10 font-medium text-indigo-700 dark:text-indigo-300' : 'hover:bg-zinc-100 dark:hover:bg-zinc-800')}>
              {f === 'pending' ? 'Pendentes' : f === 'bought' ? 'Comprados' : 'Todos'}
            </button>
          ))}
        </div>
        <Select value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">Todas as categorias</option>
          {categories?.map((c) => <option key={c} value={c}>{c}</option>)}
        </Select>
        <label className="flex items-center gap-1 text-xs text-zinc-500"><input type="checkbox" checked={grouped} onChange={(e) => setGrouped(e.target.checked)} /> agrupar por categoria</label>
      </div>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 pb-6">
        {!list.length && <EmptyState text={filter === 'bought' ? 'Nenhum item comprado ainda.' : 'Nada na lista. Adicione um item acima.'} />}
        {groups.map((g) =>
          g.items.length ? (
            <section key={g.key || 'all'}>
              {g.key && <h2 className="section-title mb-2">{g.key} <span className="font-normal normal-case tracking-normal text-zinc-400">{g.items.length}</span></h2>}
              {view === 'list' ? (
                <div className="surface overflow-hidden">{g.items.map((i) => <Row key={i.id} i={i} onEdit={() => setEditing(i)} />)}</div>
              ) : (
                <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-3">{g.items.map((i) => <Row key={i.id} i={i} card onEdit={() => setEditing(i)} />)}</div>
              )}
            </section>
          ) : null
        )}
      </div>
      {editing && <ItemDialog key={editing.id} item={editing} onClose={() => setEditing(null)} />}
    </div>
  )
}
