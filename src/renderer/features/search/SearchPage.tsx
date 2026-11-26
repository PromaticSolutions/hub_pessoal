import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import type { TaskFilter } from '@shared/types'
import { Dot, EmptyState, Input, PageHeader, PriorityBadge, Select, Tabs } from '../../components/ui'
import { useApiQuery } from '../../lib/queries'
import { formatShort } from '../../lib/format'
import { TaskFilters } from '../week/TaskFilters'
import { Highlight } from './CommandPalette'
import { attachmentOrigin } from '../../lib/attachmentOrigin'
import { useOpenTask } from '../board/BoardView'

type Tab = 'tasks' | 'comments' | 'projects' | 'companies' | 'attachments' | 'ideas'

export default function SearchPage() {
  const [params, setParams] = useSearchParams()
  const q = params.get('q') ?? ''
  const [text, setText] = useState(q)
  const [tab, setTab] = useState<Tab>('tasks')
  const [filter, setFilter] = useState<TaskFilter & { createdFrom?: string; createdTo?: string }>({})
  const { data: labels } = useApiQuery('labels.list', {})
  const open = useOpenTask()
  useEffect(() => setText(q), [q])
  useEffect(() => {
    const t = setTimeout(() => { if (text !== q) { const p = new URLSearchParams(params); p.set('q', text); setParams(p, { replace: true }) } }, 250)
    return () => clearTimeout(t)
  }, [text, q, params, setParams])
  const { data } = useApiQuery('search.query', { text: q, filter, limit: 200 }, { enabled: !!q.trim() })
  const counts = { tasks: data?.tasks.length ?? 0, comments: data?.comments.length ?? 0, projects: data?.projects.length ?? 0, companies: data?.companies.length ?? 0, attachments: data?.attachments.length ?? 0, ideas: data?.ideas.length ?? 0 }
  return (
    <div className="flex-1 overflow-y-auto">
      <PageHeader title="Busca" />
      <div className="space-y-3 px-6 py-3">
        <Input data-testid="search-input" autoFocus placeholder="Buscar…" value={text} onChange={(e) => setText(e.target.value)} className="max-w-xl" />
        <TaskFilters value={filter} onChange={setFilter} />
        <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500">
          <Select data-testid="search-label" value={filter.labelIds?.[0] ?? ''} onChange={(e) => setFilter({ ...filter, labelIds: e.target.value ? [Number(e.target.value)] : undefined })}>
            <option value="">Todas as etiquetas</option>
            {labels?.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </Select>
          <Select value={filter.statuses?.[0] ?? ''} onChange={(e) => setFilter({ ...filter, statuses: e.target.value ? [e.target.value as 'todo'] : undefined })}>
            <option value="">Todos os status</option>
            <option value="todo">A fazer</option>
            <option value="in_progress">Em andamento</option>
            <option value="done">Concluído</option>
          </Select>
          criada entre <Input type="date" className="w-36" value={filter.createdFrom ?? ''} onChange={(e) => setFilter({ ...filter, createdFrom: e.target.value || undefined })} />
          e <Input type="date" className="w-36" value={filter.createdTo ?? ''} onChange={(e) => setFilter({ ...filter, createdTo: e.target.value || undefined })} />
          · vence entre <Input type="date" className="w-36" value={filter.dueFrom ?? ''} onChange={(e) => setFilter({ ...filter, dueFrom: e.target.value || undefined })} />
          e <Input type="date" className="w-36" value={filter.dueTo ?? ''} onChange={(e) => setFilter({ ...filter, dueTo: e.target.value || undefined })} />
          <label className="flex items-center gap-1"><input type="checkbox" checked={!!filter.includeArchived} onChange={(e) => setFilter({ ...filter, includeArchived: e.target.checked })} /> incluir arquivados</label>
        </div>
        <Tabs
          value={tab}
          onChange={setTab}
          tabs={[
            { value: 'tasks', label: `Tarefas (${counts.tasks})` },
            { value: 'comments', label: `Comentários (${counts.comments})` },
            { value: 'projects', label: `Projetos (${counts.projects})` },
            { value: 'companies', label: `Empresas (${counts.companies})` },
            { value: 'attachments', label: `Arquivos (${counts.attachments})` },
            { value: 'ideas', label: `Ideias (${counts.ideas})` }
          ]}
        />
        {!q.trim() ? (
          <EmptyState text="Digite algo para buscar." />
        ) : !data ? null : (
          <div className="space-y-1" data-testid="search-results">
            {tab === 'tasks' && data.tasks.map((t) => (
              <button key={t.id} onClick={() => open(t.id)} className="flex w-full items-start gap-2 rounded p-2 text-left text-sm hover:bg-zinc-50 dark:hover:bg-zinc-900">
                <Dot color={t.companyColor} size={8} />
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{t.title}</div>
                  <div className="truncate text-xs text-zinc-500"><Highlight text={t.snippet} /></div>
                </div>
                <span className="text-xs text-zinc-500">{t.projectName}</span>
                <PriorityBadge priority={t.priority} />
                <span className="w-14 text-right text-xs text-zinc-500">{formatShort(t.dueAt)}</span>
              </button>
            ))}
            {tab === 'comments' && data.comments.map((c) => (
              <button key={c.id} onClick={() => open(c.taskId)} className="block w-full rounded p-2 text-left text-sm hover:bg-zinc-50 dark:hover:bg-zinc-900">
                <div><Highlight text={c.snippet} /></div>
                <div className="text-xs text-zinc-500">em "{c.taskTitle}" · {c.projectName}</div>
              </button>
            ))}
            {tab === 'projects' && data.projects.map((p) => (
              <Link key={p.id} to={`/projects/${p.id}`} className="flex items-center gap-2 rounded p-2 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-900"><Dot color={p.color} /> {p.name} <span className="text-xs text-zinc-500">{p.companyName}</span></Link>
            ))}
            {tab === 'companies' && data.companies.map((c) => (
              <Link key={c.id} to={`/spaces/${c.id}`} className="flex items-center gap-2 rounded p-2 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-900"><Dot color={c.color} /> {c.name}</Link>
            ))}
            {tab === 'ideas' && data.ideas.map((i) => (
              <Link key={i.id} to={`/ideas?idea=${i.id}`} className="block rounded p-2 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-900">
                <div className="font-medium">{i.title}</div>
                <div className="truncate text-xs text-zinc-500"><Highlight text={i.snippet} /></div>
              </Link>
            ))}
            {tab === 'attachments' && data.attachments.map((a) => (
              <Link key={a.id} to={attachmentOrigin(a).href} className="flex items-center gap-2 rounded p-2 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-900">
                <Dot color={attachmentOrigin(a).color} /> {a.originalName} <span className="text-xs text-zinc-500">{attachmentOrigin(a).label}</span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
