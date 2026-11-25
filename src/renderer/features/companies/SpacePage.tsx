import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { MoreHorizontal } from 'lucide-react'
import type { Project } from '@shared/types'
import type { ApiMethods } from '@shared/api'
import { PROJECT_STATUS_LABELS } from '@shared/constants'
import { Button, EmptyState, Menu, PageHeader, Tabs } from '../../components/ui'
import { useApiQuery, useCall } from '../../lib/queries'
import { formatDate } from '../../lib/format'
import { useDialogs } from './dialogs'
import { CompanyLogo } from './CompanyLogo'

type FolderNode = ApiMethods['spaces.tree']['output'][number]['folders'][number]

function ProjectCard({ p }: { p: Project }) {
  return (
    <Link
      to={`/projects/${p.id}`}
      data-testid={`project-card-${p.id}`}
      className="surface lift block p-3.5"
    >
      <div className="flex items-center gap-2 truncate font-medium"><span className="h-2 w-2 shrink-0 rounded-[2px]" style={{ background: p.color }} />{p.name}</div>
      <div className="mt-1 text-xs text-zinc-500">
        {PROJECT_STATUS_LABELS[p.status]}
        {p.dueDate && ` · prazo ${formatDate(p.dueDate)}`}
      </div>
    </Link>
  )
}

export default function SpacePage() {
  const companyId = Number(useParams().companyId)
  const [tab, setTab] = useState<'projects' | 'archived'>('projects')
  const { data: companies } = useApiQuery('companies.list', { includeArchived: true })
  const { data: tree } = useApiQuery('spaces.tree', { includeArchived: true })
  const d = useDialogs()
  const call = useCall()
  const company = companies?.find((c) => c.id === companyId)
  const space = tree?.find((s) => s.company.id === companyId)
  if (!company || !space) return <PageHeader title="Espaço" />

  const activeSections: { title: string; projects: Project[] }[] = []
  const archivedFolders: FolderNode[] = []
  const archivedProjects: Project[] = []
  const walk = (nodes: FolderNode[], path: string, hidden: boolean) =>
    nodes.forEach((f) => {
      const name = path ? `${path} / ${f.name}` : f.name
      const isHidden = hidden || !!f.archivedAt
      if (f.archivedAt) archivedFolders.push(f)
      if (!isHidden) activeSections.push({ title: name, projects: f.projects.filter((p) => !p.archivedAt) })
      archivedProjects.push(...f.projects.filter((p) => p.archivedAt))
      walk(f.children, name, isHidden)
    })
  activeSections.push({ title: '', projects: space.projects.filter((p) => !p.archivedAt) })
  archivedProjects.push(...space.projects.filter((p) => p.archivedAt))
  walk(space.folders, '', false)

  return (
    <div className="flex-1 overflow-y-auto">
      <PageHeader
        title={
          <>
            <CompanyLogo company={company} size={28} />
            {company.name}
            {company.status === 'archived' && <span className="rounded bg-zinc-200 px-2 py-0.5 text-xs dark:bg-zinc-800">arquivada</span>}
          </>
        }
      >
        <Button onClick={() => d.newFolder(companyId, null)}>Nova pasta</Button>
        <Button data-testid="space-new-project" variant="primary" onClick={() => d.openProjectForm({ companyId, folderId: null })}>Novo projeto</Button>
        {!company.isPersonal && (
          <Menu
            trigger={<Button variant="ghost" data-testid="space-menu"><MoreHorizontal size={16} /></Button>}
            items={[
              { label: 'Editar empresa', onClick: () => d.openCompanyForm(company) },
              company.status === 'active'
                ? { label: 'Arquivar empresa', onClick: () => d.archiveCompany(company) }
                : { label: 'Restaurar empresa', onClick: () => call('companies.restore', { id: company.id }) },
              'separator',
              { label: 'Excluir empresa', danger: true, testId: 'space-delete', onClick: () => d.deleteCompany(company) }
            ]}
          />
        )}
      </PageHeader>
      <div className="flex gap-6 px-6 py-4 text-sm">
        <div><div className="text-2xl font-semibold">{company.openTasks}</div><div className="text-zinc-500">tarefas abertas</div></div>
        <div><div className={`text-2xl font-semibold ${company.overdueTasks ? 'text-red-600' : ''}`}>{company.overdueTasks}</div><div className="text-zinc-500">atrasadas</div></div>
        <div><div className="text-2xl font-semibold">{company.activeProjects}</div><div className="text-zinc-500">projetos ativos</div></div>
        <div className="ml-auto flex items-end gap-2">
          <Link to={`/week?space=${companyId}`}><Button size="sm">Ver semana deste espaço</Button></Link>
          <Link to={`/?space=${companyId}`}><Button size="sm">Ver dashboard deste espaço</Button></Link>
        </div>
      </div>
      {company.description && <p className="px-6 pb-2 text-sm text-zinc-600 dark:text-zinc-400">{company.description}</p>}
      <div className="px-6">
        <Tabs value={tab} onChange={setTab} tabs={[{ value: 'projects', label: 'Projetos' }, { value: 'archived', label: 'Arquivados' }]} />
      </div>
      {tab === 'projects' ? (
        <div className="space-y-5 p-6">
          {activeSections.every((s) => !s.projects.length) && <EmptyState text="Nenhum projeto neste espaço ainda." />}
          {activeSections.map((s, i) =>
            s.projects.length ? (
              <section key={i}>
                {s.title && <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">{s.title}</h3>}
                <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3">
                  {s.projects.map((p) => <ProjectCard key={p.id} p={p} />)}
                </div>
              </section>
            ) : null
          )}
        </div>
      ) : (
        <div className="space-y-2 p-6 text-sm">
          {!archivedFolders.length && !archivedProjects.length && <EmptyState text="Nada arquivado." />}
          {archivedFolders.map((f) => (
            <div key={`f${f.id}`} className="surface flex items-center justify-between px-3 py-2">
              <span>📁 {f.name}</span>
              <Button size="sm" onClick={() => call('folders.restore', { id: f.id })}>Restaurar</Button>
            </div>
          ))}
          {archivedProjects.map((p) => (
            <div key={`p${p.id}`} className="surface flex items-center justify-between px-3 py-2">
              <Link to={`/projects/${p.id}`}>{p.name}</Link>
              <div className="flex gap-2">
                <Button size="sm" data-testid={`restore-project-${p.id}`} onClick={() => call('projects.restore', { id: p.id })}>Restaurar</Button>
                <Button size="sm" variant="ghost" className="text-red-600" onClick={() => d.deleteProject(p)}>Excluir</Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
