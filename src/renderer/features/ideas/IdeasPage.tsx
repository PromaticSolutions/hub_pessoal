import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { LayoutGrid, Lightbulb, List, Paperclip } from 'lucide-react'
import type { ApiMethods } from '@shared/api'
import type { IdeaStatus, Priority } from '@shared/types'
import { IDEA_STATUSES, IDEA_STATUS_LABELS, PRIORITIES, PRIORITY_LABELS } from '@shared/constants'
import { Dot, EmptyState, Input, PageHeader, PriorityBadge, Select } from '../../components/ui'
import { useApiQuery, useCall } from '../../lib/queries'
import { api } from '../../lib/api'
import { cx, formatDate } from '../../lib/format'
import { IdeaModal } from './IdeaModal'

type Item = ApiMethods['ideas.list']['output'][number]

const STATUS_TONE: Record<IdeaStatus, string> = {
  new: 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300',
  analysis: 'bg-sky-100 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300',
  developing: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300',
  implemented: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300',
  archived: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400'
}

export function IdeaStatusChip({ status }: { status: IdeaStatus }) {
  return <span className={cx('rounded-[3px] px-1.5 py-0.5 text-[11px] font-medium', STATUS_TONE[status])}>{IDEA_STATUS_LABELS[status]}</span>
}

function IdeaCard({ i, onOpen }: { i: Item; onOpen: () => void }) {
  return (
    <button data-testid={`idea-card-${i.id}`} onClick={onOpen} className="card block w-full space-y-2 p-3 text-left">
      <div className="text-[13px] font-semibold leading-snug">{i.title}</div>
      {i.description && <div className="line-clamp-2 text-xs text-zinc-500">{i.description}</div>}
      <div className="flex flex-wrap items-center gap-1.5">
        <PriorityBadge priority={i.priority} />
        {i.category && <span className="rounded-[3px] bg-zinc-100 px-1.5 py-0.5 text-[11px] text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">{i.category}</span>}
        {i.labels.map((l) => <span key={l.id} className="rounded-[3px] px-1.5 py-0.5 text-[10px] font-semibold text-white" style={{ background: l.color }}>{l.name}</span>)}
        {i.attachmentCount > 0 && <span className="flex items-center gap-0.5 text-[11px] text-zinc-500"><Paperclip size={11} />{i.attachmentCount}</span>}
      </div>
      {(i.companyName || i.convertedTaskId || i.convertedProjectId) && (
        <div className="flex items-center gap-1.5 text-[11px] text-zinc-500">
          {i.companyName && <><Dot color={i.companyColor ?? '#94A3B8'} size={6} />{i.companyName}{i.projectName && ` · ${i.projectName}`}</>}
          {(i.convertedTaskId || i.convertedProjectId) && <span className="ml-auto font-medium text-emerald-600">✓ virou {i.convertedTaskId ? 'tarefa' : 'projeto'}</span>}
        </div>
      )}
    </button>
  )
}

export default function IdeasPage() {
  const [params, setParams] = useSearchParams()
  const openId = Number(params.get('idea')) || null
  const setOpen = (id: number | null) => { const p = new URLSearchParams(params); if (id) p.set('idea', String(id)); else p.delete('idea'); setParams(p) }
  const [status, setStatus] = useState('')
  const [category, setCategory] = useState('')
  const [priority, setPriority] = useState('')
  const [companyId, setCompanyId] = useState('')
  const [labelId, setLabelId] = useState('')
  const [text, setText] = useState('')
  const [quick, setQuick] = useState('')
  const { data: viewSetting } = useApiQuery('settings.get', { key: 'ideas.view' })
  const [viewLocal, setViewLocal] = useState<'cards' | 'list' | null>(null)
  const view = viewLocal ?? (viewSetting === 'list' ? 'list' : 'cards')
  const { data: ideas } = useApiQuery('ideas.list', {
    status: status ? [status as IdeaStatus] : undefined,
    category: category || undefined,
    priority: (priority || undefined) as Priority | undefined,
    companyId: companyId ? Number(companyId) : undefined,
    labelId: labelId ? Number(labelId) : undefined,
    text: text || undefined
  })
  const { data: categories } = useApiQuery('ideas.categories', {})
  const { data: tree } = useApiQuery('spaces.tree', {})
  const { data: labels } = useApiQuery('labels.list', {})
  const call = useCall()
  const list = ideas ?? []
  const setView = (v: 'cards' | 'list') => { setViewLocal(v); api('settings.set', { key: 'ideas.view', value: v }).catch(() => {}) }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader title={<><Lightbulb size={20} className="text-amber-500" /> Ideias</>}>
        <div className="flex overflow-hidden rounded-[5px] border border-[var(--line-strong)]">
          <button data-testid="ideas-view-cards" onClick={() => setView('cards')} className={cx('flex items-center gap-1 px-2.5 py-1.5 text-sm', view === 'cards' ? 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-300' : 'hover:bg-zinc-100 dark:hover:bg-zinc-800')}><LayoutGrid size={14} /> Cards</button>
          <button data-testid="ideas-view-list" onClick={() => setView('list')} className={cx('flex items-center gap-1 px-2.5 py-1.5 text-sm', view === 'list' ? 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-300' : 'hover:bg-zinc-100 dark:hover:bg-zinc-800')}><List size={14} /> Lista</button>
        </div>
      </PageHeader>
      <div className="mx-6 mb-3 space-y-2">
        <form
          onSubmit={async (e) => {
            e.preventDefault()
            if (!quick.trim()) return
            await call('ideas.create', { title: quick })
            setQuick('')
          }}
        >
          <Input data-testid="idea-quick" className="h-10 text-[15px]" placeholder="💡 Anote uma ideia e tecle Enter…" value={quick} onChange={(e) => setQuick(e.target.value)} />
        </form>
        <div className="glass flex flex-wrap items-center gap-2 rounded-md px-3 py-2">
          <Input className="w-56" placeholder="Buscar…" value={text} onChange={(e) => setText(e.target.value)} />
          <Select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Todos os status</option>
            {IDEA_STATUSES.map((s) => <option key={s} value={s}>{IDEA_STATUS_LABELS[s]}</option>)}
          </Select>
          <Select value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">Todas as categorias</option>
            {categories?.map((c) => <option key={c} value={c}>{c}</option>)}
          </Select>
          <Select value={priority} onChange={(e) => setPriority(e.target.value)}>
            <option value="">Todas as prioridades</option>
            {PRIORITIES.map((p) => <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>)}
          </Select>
          <Select value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
            <option value="">Todas as empresas</option>
            {tree?.map((s) => <option key={s.company.id} value={s.company.id}>{s.company.name}</option>)}
          </Select>
          <Select value={labelId} onChange={(e) => setLabelId(e.target.value)}>
            <option value="">Todas as etiquetas</option>
            {labels?.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </Select>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto px-6 pb-6">
        {!list.length ? (
          <EmptyState text="Nenhuma ideia ainda. Anote a primeira no campo acima." />
        ) : view === 'cards' ? (
          <div className="grid min-h-full auto-cols-[minmax(240px,1fr)] grid-flow-col gap-3">
            {IDEA_STATUSES.filter((s) => !status || s === status).map((s) => {
              const items = list.filter((i) => i.status === s)
              return (
                <section key={s} data-testid={`ideas-col-${s}`} className="lane flex min-h-0 flex-col">
                  <header className="flex items-center justify-between px-2.5 pb-1.5 pt-2.5">
                    <IdeaStatusChip status={s} />
                    <span className="text-[11px] font-semibold text-zinc-500">{items.length}</span>
                  </header>
                  <div className="flex flex-col gap-2 p-2">{items.map((i) => <IdeaCard key={i.id} i={i} onOpen={() => setOpen(i.id)} />)}</div>
                </section>
              )
            })}
          </div>
        ) : (
          <div className="surface overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--line)] text-left text-xs text-zinc-500">
                  <th className="py-2 pl-3 font-medium">Ideia</th>
                  <th className="py-2 font-medium">Status</th>
                  <th className="py-2 font-medium">Categoria</th>
                  <th className="py-2 font-medium">Prioridade</th>
                  <th className="py-2 font-medium">Empresa</th>
                  <th className="py-2 pr-3 text-right font-medium">Criada em</th>
                </tr>
              </thead>
              <tbody>
                {list.map((i) => (
                  <tr key={i.id} data-testid={`idea-row-${i.id}`} className="cursor-pointer border-b border-[var(--line)] last:border-0 hover:bg-zinc-50 dark:hover:bg-zinc-800/40" onClick={() => setOpen(i.id)}>
                    <td className="py-2 pl-3 font-medium">{i.title}</td>
                    <td className="py-2"><IdeaStatusChip status={i.status} /></td>
                    <td className="py-2 text-xs text-zinc-600 dark:text-zinc-400">{i.category || '—'}</td>
                    <td className="py-2"><PriorityBadge priority={i.priority} /></td>
                    <td className="py-2 text-xs">{i.companyName ? <span className="flex items-center gap-1.5"><Dot color={i.companyColor ?? '#94A3B8'} size={7} />{i.companyName}</span> : '—'}</td>
                    <td className="py-2 pr-3 text-right text-xs text-zinc-500">{formatDate(i.createdAt, false)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {openId && <IdeaModal key={openId} id={openId} onClose={() => setOpen(null)} />}
    </div>
  )
}
