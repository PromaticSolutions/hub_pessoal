import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { TabBar } from './TabBar'
import { DialogsProvider } from '../features/companies/dialogs'
import { TaskModalHost } from '../features/task-modal/TaskModal'
import { CommandPalette } from '../features/search/CommandPalette'

export function Layout() {
  return (
    <DialogsProvider>
      <div className="flex h-full gap-3 bg-[var(--page)] p-3 text-zinc-900 dark:text-zinc-100">
        <Sidebar />
        <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <TabBar />
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
