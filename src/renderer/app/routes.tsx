import { useEffect, useRef } from 'react'
import { Route, Routes, useLocation } from 'react-router-dom'
import { TabsProvider } from './tabs-context'
import { api } from '../lib/api'
import { Layout } from './Layout'
import DashboardPage from '../features/dashboard/DashboardPage'
import WeekPage from '../features/week/WeekPage'
import CalendarPage from '../features/calendar/CalendarPage'
import FilesPage from '../features/files/FilesPage'
import CompaniesPage from '../features/companies/CompaniesPage'
import SpacePage from '../features/companies/SpacePage'
import ProjectPage from '../features/projects/ProjectPage'
import SearchPage from '../features/search/SearchPage'
import SettingsPage from '../features/settings/SettingsPage'
import { EmptyState, PageHeader } from '../components/ui'

function NotFoundPage() {
  return (
    <div className="flex-1 overflow-y-auto">
      <PageHeader title="Página não encontrada" />
      <EmptyState text="Esta aba aponta para uma página que não existe mais. Feche a aba ou use o menu lateral." />
    </div>
  )
}

/** Keeps the v1 'lastRoute' setting updated (tabs restore is done by TabsProvider). */
function RouteMemory() {
  const loc = useLocation()
  const first = useRef(true)
  useEffect(() => {
    if (first.current) { first.current = false; return }
    const params = new URLSearchParams(loc.search)
    params.delete('task')
    const qs = params.toString()
    api('settings.set', { key: 'lastRoute', value: loc.pathname + (qs ? `?${qs}` : '') }).catch(() => {})
  }, [loc.pathname, loc.search])
  return null
}

export function AppRoutes() {
  return (
    <TabsProvider>
      <RouteMemory />
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/week" element={<WeekPage />} />
          <Route path="/calendar" element={<CalendarPage />} />
          <Route path="/files" element={<FilesPage />} />
          <Route path="/companies" element={<CompaniesPage />} />
          <Route path="/spaces/:companyId" element={<SpacePage />} />
          <Route path="/projects/:projectId" element={<ProjectPage />} />
          <Route path="/projects/:projectId/boards/:boardId" element={<ProjectPage />} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </TabsProvider>
  )
}
