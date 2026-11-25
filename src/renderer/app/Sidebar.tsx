import { NavLink } from 'react-router-dom'
import { Building2, CalendarDays, CalendarRange, LayoutDashboard, Paperclip, Search, Settings } from 'lucide-react'
import type { ReactNode } from 'react'
import { cx } from '../lib/format'

function Item({ to, icon, label, testId }: { to: string; icon: ReactNode; label: string; testId: string }) {
  return (
    <NavLink
      to={to}
      end={to === '/'}
      data-testid={testId}
      className={({ isActive }) =>
        cx(
          'flex items-center gap-2 rounded-md px-2 py-1.5 text-sm',
          isActive ? 'bg-zinc-200 font-medium dark:bg-zinc-800' : 'text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-900'
        )
      }
    >
      {icon}
      {label}
    </NavLink>
  )
}

export function Sidebar() {
  return (
    <aside className="flex w-62 shrink-0 flex-col border-r border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/50">
      <div className="px-4 py-3 text-sm font-bold tracking-tight">Personal Task Hub</div>
      <div className="px-2">
        <button
          data-testid="open-search"
          onClick={() => window.dispatchEvent(new CustomEvent('open-command-palette'))}
          className="mb-2 flex w-full items-center gap-2 rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-sm text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900"
        >
          <Search size={14} /> Buscar <span className="ml-auto text-xs">Ctrl+K</span>
        </button>
        <nav className="flex flex-col gap-0.5">
          <Item to="/" icon={<LayoutDashboard size={16} />} label="Dashboard" testId="nav-dashboard" />
          <Item to="/week" icon={<CalendarRange size={16} />} label="Minha semana" testId="nav-week" />
          <Item to="/calendar" icon={<CalendarDays size={16} />} label="Calendário" testId="nav-calendar" />
          <Item to="/files" icon={<Paperclip size={16} />} label="Arquivos" testId="nav-files" />
          <Item to="/companies" icon={<Building2 size={16} />} label="Empresas" testId="nav-companies" />
        </nav>
      </div>
      <div className="mt-4 flex-1 overflow-y-auto px-2" id="space-tree-slot" />
      <div className="border-t border-zinc-200 p-2 dark:border-zinc-800">
        <Item to="/settings" icon={<Settings size={16} />} label="Configurações" testId="nav-settings" />
      </div>
    </aside>
  )
}
