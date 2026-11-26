import { useEffect, useState } from 'react'
import { CalendarClock, CalendarDays, CalendarRange, FolderKanban, LayoutDashboard, Lightbulb, ListChecks, Paperclip, Plus, Search, Settings, ShoppingCart, Building2, X, CircleAlert } from 'lucide-react'
import type { ReactNode } from 'react'
import { useApiQuery } from '../lib/queries'
import { cx } from '../lib/format'
import { useTabs } from './tabs-context'
import { routeTitle } from './routeTitle'

const ICONS: Record<string, ReactNode> = {
  '/': <LayoutDashboard size={14} />,
  '/day': <CalendarClock size={14} />,
  '/week': <CalendarRange size={14} />,
  '/all': <ListChecks size={14} />,
  '/calendar': <CalendarDays size={14} />,
  '/ideas': <Lightbulb size={14} />,
  '/shopping': <ShoppingCart size={14} />,
  '/files': <Paperclip size={14} />,
  '/companies': <Building2 size={14} />,
  '/search': <Search size={14} />,
  '/settings': <Settings size={14} />
}

function isTyping(e: KeyboardEvent) {
  const el = e.target as HTMLElement
  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) || el.isContentEditable
}

export function TabBar() {
  const tabs = useTabs()
  const { data: tree } = useApiQuery('spaces.tree', { includeArchived: true })
  const [dragId, setDragId] = useState<string | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return
      const k = e.key.toLowerCase()
      if (k === 'tab') { e.preventDefault(); tabs.cycle(e.shiftKey ? -1 : 1); return }
      if (isTyping(e)) return
      if (k === 't') { e.preventDefault(); tabs.open('/all') }
      else if (k === 'w') { e.preventDefault(); tabs.close(tabs.state.activeId) }
      else if (/^[1-9]$/.test(k)) { e.preventDefault(); tabs.activateIndex(k === '9' ? tabs.state.tabs.length - 1 : Number(k) - 1) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [tabs])

  return (
    <div className="glass mb-3 flex h-10 shrink-0 items-end gap-1 overflow-x-auto rounded-md px-1.5 pt-1.5" role="tablist" aria-label="Abas abertas">
      {tabs.state.tabs.map((t, i) => {
        const info = routeTitle(t.path, tree)
        const isActive = t.id === tabs.state.activeId
        const icon = info.kind === 'missing' ? <CircleAlert size={14} className="text-red-500" /> : info.color ? <span className="h-2 w-2 rounded-[2px]" style={{ background: info.color }} /> : ICONS[t.path.split('?')[0]] ?? <FolderKanban size={14} />
        return (
          <div
            key={t.id}
            role="tab"
            aria-selected={isActive}
            data-testid={`tab-${t.id}`}
            data-tab-path={t.path}
            data-active={isActive || undefined}
            draggable={!t.pinned}
            onDragStart={(e) => { setDragId(t.id); e.dataTransfer.effectAllowed = 'move' }}
            onDragOver={(e) => dragId && e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); if (dragId) tabs.move(dragId, i); setDragId(null) }}
            onDragEnd={() => setDragId(null)}
            onClick={() => tabs.activate(t.id)}
            onAuxClick={(e) => { if (e.button === 1 && !t.pinned) { e.preventDefault(); tabs.close(t.id) } }}
            title={info.title}
            className={cx(
              'group flex h-[30px] max-w-52 min-w-0 shrink-0 cursor-default select-none items-center gap-2 rounded-t-[5px] px-3 text-[13px] transition-colors',
              isActive ? 'bg-[var(--surface)] font-medium text-zinc-900 shadow-[0_-1px_0_var(--line),0_1px_6px_rgba(16,24,40,.06)] dark:text-zinc-100' : 'text-zinc-500 hover:bg-white/60 hover:text-zinc-800 dark:hover:bg-zinc-800/60 dark:hover:text-zinc-200',
              t.pinned && 'pr-3'
            )}
          >
            <span className="flex shrink-0 items-center opacity-80">{icon}</span>
            <span className="truncate">{info.title}</span>
            {!t.pinned && (
              <button
                type="button"
                aria-label={`Fechar ${info.title}`}
                data-testid={`tab-close-${t.id}`}
                onClick={(e) => { e.stopPropagation(); tabs.close(t.id) }}
                className={cx('-mr-1 rounded-[3px] p-0.5 text-zinc-400 hover:bg-zinc-200 hover:text-zinc-700 dark:hover:bg-zinc-700', !isActive && 'opacity-0 group-hover:opacity-100')}
              >
                <X size={12} />
              </button>
            )}
          </div>
        )
      })}
      <button type="button" data-testid="tab-new" aria-label="Nova aba" title="Nova aba (Ctrl+T)" onClick={() => tabs.open('/all')} className="mb-1 ml-1 rounded-[4px] p-1 text-zinc-500 hover:bg-white/70 hover:text-zinc-800 dark:hover:bg-zinc-800">
        <Plus size={15} />
      </button>
    </div>
  )
}
