import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { DialogsProvider } from '../features/companies/dialogs'

export function Layout() {
  return (
    <DialogsProvider>
      <div className="flex h-full bg-white text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
        <Sidebar />
        <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <Outlet />
        </main>
      </div>
    </DialogsProvider>
  )
}
