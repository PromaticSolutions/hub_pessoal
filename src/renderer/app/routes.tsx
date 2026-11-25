import { useEffect, useRef } from 'react'
import { Route, Routes, useLocation, useNavigate } from 'react-router-dom'
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

function RouteMemory() {
  const loc = useLocation()
  const nav = useNavigate()
  const restored = useRef(false)
  useEffect(() => {
    if (restored.current) return
    restored.current = true
    if (loc.pathname !== '/' || loc.search) return
    api('settings.get', { key: 'lastRoute' }).then((r) => {
      if (typeof r === 'string' && r !== '/' && !r.includes('task=')) nav(r, { replace: true })
    }).catch(() => {})
  }, [loc.pathname, loc.search, nav])
  useEffect(() => {
    if (!restored.current) return
    const params = new URLSearchParams(loc.search)
    params.delete('task')
    const qs = params.toString()
    api('settings.set', { key: 'lastRoute', value: loc.pathname + (qs ? `?${qs}` : '') }).catch(() => {})
  }, [loc.pathname, loc.search])
  return null
}

export function AppRoutes() {
  return (
    <>
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
        </Route>
      </Routes>
    </>
  )
}
