import { useEffect, useState } from 'react'
import { CalendarClock, CalendarDays, CalendarRange, ChevronLeft, ChevronRight, FolderKanban, LayoutDashboard, Lightbulb, ListChecks, PanelLeftClose, PanelLeftOpen, Paperclip, Plus, RotateCw, Search, Settings, ShoppingCart, Building2, X, CircleAlert } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
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

function ToolButton({ label, onClick, disabled, testId, children }: { label: string; onClick: () => void; disabled?: boolean; testId: string; children: ReactNode }) {
  return (
    <button
      type="button"
      data-testid={testId}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="rounded-[4px] p-1.5 text-zinc-500 transition-colors hover:bg-white/70 hover:text-zinc-800 disabled:pointer-events-none disabled:opacity-35 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
    >
      {children}
    </button>
  )
}

export function TabBar({ sidebarCollapsed = false, onToggleSidebar }: { sidebarCollapsed?: boolean; onToggleSidebar?: () => void }) {
  const tabs = useTabs()
  const qc = useQueryClient()
  const [spinning, setSpinning] = useState(false)
  const refresh = () => {
    setSpinning(true)
    qc.invalidateQueries().finally(() => setTimeout(() => setSpinning(false), 300))
  }
  const { data: tree } = useApiQuery('spaces.tree', { includeArchived: true })
  const [dragId, setDragId] = useState<string | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase()
      // Browsers reserve Ctrl+T/W/Tab, so Alt variants work everywhere (Ctrl ones kept where the browser lets them through).
      if (e.altKey && !e.ctrlKey && !e.metaKey) {
        if (k === 'arrowleft' || k === 'arrowright') { if (isTyping(e)) return; e.preventDefault(); if (k === 'arrowleft') tabs.back(); else tabs.forward(); return }
        if (k === 'pagedown' || k === 'pageup') { e.preventDefault(); tabs.cycle(k === 'pagedown' ? 1 : -1); return }
        const digit = /^Digit([1-9])$/.exec(e.code)?.[1] ?? (/^[1-9]$/.test(k) ? k : null)
        if (digit) { e.preventDefault(); tabs.activateIndex(digit === '9' ? tabs.state.tabs.length - 1 : Number(digit) - 1); return }
        if (isTyping(e)) return
        if (e.code === 'KeyT' || k === 't') { e.preventDefault(); tabs.open('/all') }
        else if (e.code === 'KeyW' || k === 'w') { e.preventDefault(); tabs.close(tabs.state.activeId) }
        return
      }
      if (!(e.ctrlKey || e.metaKey)) return
      if (k === 'tab') { e.preventDefault(); tabs.cycle(e.shiftKey ? -1 : 1); return }
      if (isTyping(e)) return
      if (k === 'b' && !e.shiftKey) { e.preventDefault(); onToggleSidebar?.(); return }
      if (k === 't') { e.preventDefault(); tabs.open('/all') }
      else if (k === 'w') { e.preventDefault(); tabs.close(tabs.state.activeId) }
      else if (/^[1-9]$/.test(k)) { e.preventDefault(); tabs.activateIndex(k === '9' ? tabs.state.tabs.length - 1 : Number(k) - 1) }
    }
    // Mouse side buttons (3 = back, 4 = forward) move through the active tab's history.
    const onMouse = (e: MouseEvent) => {
      if (e.button !== 3 && e.button !== 4) return
      e.preventDefault()
      if (e.button === 3) tabs.back()
      else tabs.forward()
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('mouseup', onMouse)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('mouseup', onMouse)
    }
  }, [tabs, onToggleSidebar])

  return (
    <div className="glass mb-3 flex h-10 shrink-0 items-center rounded-md px-1.5">
      <div className="mr-1 flex shrink-0 items-center gap-0.5 border-r border-[var(--line)] pr-1.5">
        <ToolButton testId="sidebar-toggle" label={sidebarCollapsed ? 'Mostrar menu lateral (Ctrl+B)' : 'Esconder menu lateral (Ctrl+B)'} onClick={() => onToggleSidebar?.()}>
          {sidebarCollapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
        </ToolButton>
        <ToolButton testId="nav-back" label="Voltar (Alt+←)" disabled={!tabs.canBack} onClick={tabs.back}><ChevronLeft size={16} /></ToolButton>
        <ToolButton testId="nav-forward" label="Avançar (Alt+→)" disabled={!tabs.canForward} onClick={tabs.forward}><ChevronRight size={16} /></ToolButton>
        <ToolButton testId="nav-refresh" label="Atualizar dados" onClick={refresh}><RotateCw size={15} className={cx(spinning && 'animate-spin')} /></ToolButton>
      </div>
    <div className="flex h-full min-w-0 flex-1 items-end gap-1 overflow-x-auto pt-1.5" role="tablist" aria-label="Abas abertas">
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
      <button type="button" data-testid="tab-new" aria-label="Nova aba" title="Nova aba (Alt+T)" onClick={() => tabs.open('/all')} className="mb-1 ml-1 rounded-[4px] p-1 text-zinc-500 hover:bg-white/70 hover:text-zinc-800 dark:hover:bg-zinc-800">
        <Plus size={15} />
      </button>
    </div>
    </div>
  )
}
