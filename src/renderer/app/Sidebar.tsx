import { Building2, CalendarClock, CalendarDays, CalendarRange, LayoutDashboard, Lightbulb, ListChecks, Paperclip, Search, Settings, ShoppingCart } from 'lucide-react'
import type { ReactNode } from 'react'
import { cx } from '../lib/format'
import { SpaceTree } from './SpaceTree'
import { AppNavLink } from './tabs-context'

function Item({ to, icon, label, testId, compact }: { to: string; icon: ReactNode; label: string; testId: string; compact?: boolean }) {
  return (
    <AppNavLink
      to={to}
      end={to === '/'}
      data-testid={testId}
      title={compact ? label : undefined}
      aria-label={compact ? label : undefined}
      className={({ isActive }) =>
        cx(
          'flex items-center gap-2.5 rounded-[5px] py-1.5 text-sm transition-colors',
          compact ? 'justify-center px-0' : 'px-2.5',
          isActive ? 'bg-indigo-50 font-semibold text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300' : 'text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800/70'
        )
      }
    >
      {icon}
      {!compact && label}
    </AppNavLink>
  )
}

export function Sidebar({ collapsed = false }: { collapsed?: boolean }) {
  const c = collapsed
  return (
    <aside data-testid="sidebar" data-collapsed={c || undefined} className={cx('surface flex shrink-0 flex-col overflow-hidden transition-[width] duration-200', c ? 'w-14' : 'w-62')}>
      <div className={cx('flex items-center gap-2.5 py-4 text-sm font-bold tracking-tight', c ? 'justify-center px-0' : 'px-4')}>
        <span className="flex h-7 w-7 items-center justify-center rounded-[5px] bg-indigo-600 text-white shadow-[0_2px_6px_rgba(79,70,229,.35)]">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12l5 5L20 7" /></svg>
        </span>
        {!c && 'Personal Task Hub'}
      </div>
      <div className="px-2">
        <button
          data-testid="open-search"
          onClick={() => window.dispatchEvent(new CustomEvent('open-command-palette'))}
          title={c ? 'Buscar (Ctrl K)' : undefined}
          aria-label="Buscar"
          className={cx('mb-3 flex w-full items-center gap-2 rounded-[5px] border border-zinc-200 bg-zinc-50 py-1.5 text-sm text-zinc-500 transition hover:bg-white hover:shadow-[0_2px_6px_rgba(16,24,40,.08)] dark:border-zinc-700 dark:bg-zinc-900', c ? 'justify-center px-0' : 'px-2.5')}
        >
          <Search size={14} />
          {!c && <>Buscar <span className="ml-auto rounded-[3px] border border-zinc-200 bg-white px-1 text-[10px] dark:border-zinc-700 dark:bg-zinc-800">Ctrl K</span></>}
        </button>
        <nav className="flex flex-col gap-0.5">
          <Item to="/" icon={<LayoutDashboard size={16} />} label="Dashboard" testId="nav-dashboard" compact={c} />
          <Item to="/day" icon={<CalendarClock size={16} />} label="Meu Dia" testId="nav-day" compact={c} />
          <Item to="/week" icon={<CalendarRange size={16} />} label="Minha semana" testId="nav-week" compact={c} />
          <Item to="/all" icon={<ListChecks size={16} />} label="Todas as Tarefas" testId="nav-all" compact={c} />
          <Item to="/calendar" icon={<CalendarDays size={16} />} label="Calendário" testId="nav-calendar" compact={c} />
          <Item to="/ideas" icon={<Lightbulb size={16} />} label="Ideias" testId="nav-ideas" compact={c} />
          <Item to="/shopping" icon={<ShoppingCart size={16} />} label="Lista de Compras" testId="nav-shopping" compact={c} />
          <Item to="/files" icon={<Paperclip size={16} />} label="Arquivos" testId="nav-files" compact={c} />
          <Item to="/companies" icon={<Building2 size={16} />} label="Empresas" testId="nav-companies" compact={c} />
        </nav>
      </div>
      <div className="mt-4 flex-1 overflow-y-auto px-2">
        {!c && <SpaceTree />}
      </div>
      <div className="border-t border-[var(--line)] p-2">
        <Item to="/settings" icon={<Settings size={16} />} label="Configurações" testId="nav-settings" compact={c} />
      </div>
    </aside>
  )
}
