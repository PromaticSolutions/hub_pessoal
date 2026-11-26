import { Building2, CalendarDays, CalendarRange, LayoutDashboard, Paperclip, Search, Settings } from 'lucide-react'
import type { ReactNode } from 'react'
import { cx } from '../lib/format'
import { SpaceTree } from './SpaceTree'
import { AppNavLink } from './tabs-context'

function Item({ to, icon, label, testId }: { to: string; icon: ReactNode; label: string; testId: string }) {
  return (
    <AppNavLink
      to={to}
      end={to === '/'}
      data-testid={testId}
      className={({ isActive }) =>
        cx(
          'flex items-center gap-2.5 rounded-[5px] px-2.5 py-1.5 text-sm transition-colors',
          isActive ? 'bg-indigo-50 font-semibold text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300' : 'text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800/70'
        )
      }
    >
      {icon}
      {label}
    </AppNavLink>
  )
}

export function Sidebar() {
  return (
    <aside className="surface flex w-62 shrink-0 flex-col overflow-hidden">
      <div className="flex items-center gap-2.5 px-4 py-4 text-sm font-bold tracking-tight">
        <span className="flex h-7 w-7 items-center justify-center rounded-[5px] bg-indigo-600 text-white shadow-[0_2px_6px_rgba(79,70,229,.35)]">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12l5 5L20 7" /></svg>
        </span>
        Personal Task Hub
      </div>
      <div className="px-2">
        <button
          data-testid="open-search"
          onClick={() => window.dispatchEvent(new CustomEvent('open-command-palette'))}
          className="mb-3 flex w-full items-center gap-2 rounded-[5px] border border-zinc-200 bg-zinc-50 px-2.5 py-1.5 text-sm text-zinc-500 transition hover:bg-white hover:shadow-[0_2px_6px_rgba(16,24,40,.08)] dark:border-zinc-700 dark:bg-zinc-900"
        >
          <Search size={14} /> Buscar <span className="ml-auto rounded-[3px] border border-zinc-200 bg-white px-1 text-[10px] dark:border-zinc-700 dark:bg-zinc-800">Ctrl K</span>
        </button>
        <nav className="flex flex-col gap-0.5">
          <Item to="/" icon={<LayoutDashboard size={16} />} label="Dashboard" testId="nav-dashboard" />
          <Item to="/week" icon={<CalendarRange size={16} />} label="Minha semana" testId="nav-week" />
          <Item to="/calendar" icon={<CalendarDays size={16} />} label="Calendário" testId="nav-calendar" />
          <Item to="/files" icon={<Paperclip size={16} />} label="Arquivos" testId="nav-files" />
          <Item to="/companies" icon={<Building2 size={16} />} label="Empresas" testId="nav-companies" />
        </nav>
      </div>
      <div className="mt-4 flex-1 overflow-y-auto px-2">
        <SpaceTree />
      </div>
      <div className="border-t border-[var(--line)] p-2">
        <Item to="/settings" icon={<Settings size={16} />} label="Configurações" testId="nav-settings" />
      </div>
    </aside>
  )
}
