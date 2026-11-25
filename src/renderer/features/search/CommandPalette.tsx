import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Search } from 'lucide-react'
import { Dot } from '../../components/ui'
import { useApiQuery } from '../../lib/queries'
import { cx } from '../../lib/format'

type Row = { key: string; group: string; label: string; sub?: string; color?: string; go: () => void }

export function Highlight({ text }: { text: string }) {
  const parts = text.split(/(«[^»]*»)/g)
  return <>{parts.map((p, i) => (p.startsWith('«') ? <mark key={i} className="rounded bg-yellow-200 px-0.5 dark:bg-yellow-700/60">{p.slice(1, -1)}</mark> : <span key={i}>{p}</span>))}</>
}

export function CommandPalette() {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [debounced, setDebounced] = useState('')
  const [sel, setSel] = useState(0)
  const nav = useNavigate()
  const loc = useLocation()
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setOpen(true) }
    }
    const onOpen = () => setOpen(true)
    window.addEventListener('keydown', onKey)
    window.addEventListener('open-command-palette', onOpen)
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('open-command-palette', onOpen) }
  }, [])
  useEffect(() => {
    const t = setTimeout(() => setDebounced(text), 120)
    return () => clearTimeout(t)
  }, [text])
  const { data } = useApiQuery('search.query', { text: debounced, limit: 5 }, { enabled: open && !!debounced.trim() })
  const close = () => { setOpen(false); setText(''); setDebounced(''); setSel(0) }
  const openTask = (id: number, projectId: number) => { close(); nav(`/projects/${projectId}?task=${id}`) }

  const rows: Row[] = useMemo(() => {
    if (!data || !debounced.trim()) return []
    const r: Row[] = []
    data.tasks.forEach((t) => r.push({ key: `t${t.id}`, group: 'Tarefas', label: t.title, sub: `${t.companyName} › ${t.projectName}`, color: t.companyColor, go: () => openTask(t.id, t.projectId) }))
    data.comments.forEach((c) => r.push({ key: `c${c.id}`, group: 'Comentários', label: c.snippet, sub: `em "${c.taskTitle}"`, color: c.companyColor, go: () => { close(); nav({ pathname: loc.pathname, search: `?task=${c.taskId}` }) } }))
    data.projects.forEach((p) => r.push({ key: `p${p.id}`, group: 'Projetos', label: p.name, sub: p.companyName, color: p.color, go: () => { close(); nav(`/projects/${p.id}`) } }))
    data.companies.forEach((c) => r.push({ key: `e${c.id}`, group: 'Empresas', label: c.name, color: c.color, go: () => { close(); nav(`/spaces/${c.id}`) } }))
    data.attachments.forEach((a) => r.push({ key: `a${a.id}`, group: 'Arquivos', label: a.originalName, sub: a.taskTitle ? `em "${a.taskTitle}"` : a.projectName, color: a.companyColor, go: () => { close(); nav(a.taskId ? `/projects/${a.projectId}?task=${a.taskId}` : `/projects/${a.projectId}`) } }))
    r.push({ key: 'all', group: '', label: `Ver todos os resultados para "${debounced}"`, go: () => { close(); nav(`/search?q=${encodeURIComponent(debounced)}`) } })
    return r
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, debounced])
  useEffect(() => setSel(0), [rows.length])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center bg-black/40 pt-24" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="w-full max-w-xl overflow-hidden rounded-lg bg-white shadow-2xl dark:bg-zinc-900" data-testid="command-palette">
        <div className="flex items-center gap-2 border-b border-zinc-200 px-3 dark:border-zinc-800">
          <Search size={16} className="text-zinc-400" />
          <input
            data-testid="palette-input"
            autoFocus
            className="h-11 flex-1 bg-transparent text-sm outline-none"
            placeholder="Buscar tarefas, projetos, empresas, comentários, arquivos…"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') close()
              if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(s + 1, rows.length - 1)) }
              if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)) }
              if (e.key === 'Enter') rows[sel]?.go()
            }}
          />
        </div>
        <div className="max-h-96 overflow-y-auto py-1">
          {debounced.trim() && rows.length <= 1 && data && <div className="px-3 py-2 text-sm text-zinc-500">Nada encontrado.</div>}
          {rows.map((r, i) => (
            <div key={r.key}>
              {r.group && r.group !== rows[i - 1]?.group && <div className="px-3 pt-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">{r.group}</div>}
              <button
                data-testid={`palette-row-${r.key}`}
                onMouseEnter={() => setSel(i)}
                onClick={r.go}
                className={cx('flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm', i === sel && 'bg-zinc-100 dark:bg-zinc-800', !r.group && 'text-indigo-600')}
              >
                {r.color && <Dot color={r.color} size={8} />}
                <span className="min-w-0 flex-1 truncate"><Highlight text={r.label} /></span>
                {r.sub && <span className="truncate text-xs text-zinc-500">{r.sub}</span>}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
