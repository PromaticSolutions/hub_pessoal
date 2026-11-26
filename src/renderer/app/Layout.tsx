import { useCallback, useEffect, useState } from 'react'
import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { TabBar } from './TabBar'
import { DialogsProvider } from '../features/companies/dialogs'
import { TaskModalHost } from '../features/task-modal/TaskModal'
import { CommandPalette } from '../features/search/CommandPalette'

const SIDEBAR_KEY = 'hub.sidebar.collapsed'
const readCollapsed = () => {
  try { return globalThis.localStorage?.getItem(SIDEBAR_KEY) === '1' } catch { return false }
}

export function Layout() {
  const [collapsed, setCollapsed] = useState(readCollapsed)
  const toggleSidebar = useCallback(() => setCollapsed((c) => !c), [])
  useEffect(() => {
    try { globalThis.localStorage?.setItem(SIDEBAR_KEY, collapsed ? '1' : '0') } catch { /* per-device convenience only */ }
  }, [collapsed])
  return (
    <DialogsProvider>
      <div className="flex h-full gap-3 bg-[var(--page)] p-3 text-zinc-900 dark:text-zinc-100">
        <Sidebar collapsed={collapsed} />
        <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <TabBar sidebarCollapsed={collapsed} onToggleSidebar={toggleSidebar} />
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <Outlet />
          </div>
        </main>
      </div>
      <TaskModalHost />
      <CommandPalette />
    </DialogsProvider>
  )
}
