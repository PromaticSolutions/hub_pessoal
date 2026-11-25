import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Button, EmptyState, PageHeader, Tabs } from '../../components/ui'
import { useApiQuery, useCall } from '../../lib/queries'
import { useDialogs } from './dialogs'
import { CompanyLogo } from './CompanyLogo'

export default function CompaniesPage() {
  const [tab, setTab] = useState<'active' | 'archived'>('active')
  const { data } = useApiQuery('companies.list', { includeArchived: true })
  const d = useDialogs()
  const call = useCall()
  const list = (data ?? []).filter((c) => c.status === tab)
  return (
    <div className="flex-1 overflow-y-auto">
      <PageHeader title="Empresas">
        <Button data-testid="new-company" variant="primary" onClick={() => d.openCompanyForm()}>Nova empresa</Button>
      </PageHeader>
      <div className="px-6 pt-3">
        <Tabs value={tab} onChange={setTab} tabs={[{ value: 'active', label: 'Ativas' }, { value: 'archived', label: 'Arquivadas' }]} />
      </div>
      {!list.length ? (
        <EmptyState text={tab === 'active' ? 'Nenhuma empresa ativa.' : 'Nenhuma empresa arquivada.'} />
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3 p-6">
          {list.map((c) => (
            <div key={c.id} data-testid={`company-card-${c.id}`} className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
              <Link to={`/spaces/${c.id}`} className="flex items-center gap-3">
                <CompanyLogo company={c} />
                <div className="min-w-0">
                  <div className="truncate font-semibold">{c.name}</div>
                  <div className="text-xs text-zinc-500">{c.isPersonal ? 'Espaço pessoal' : 'Empresa'}</div>
                </div>
              </Link>
              <div className="mt-3 flex gap-4 text-xs text-zinc-600 dark:text-zinc-400">
                <span>{c.activeProjects} projeto(s) ativo(s)</span>
                <span>{c.openTasks} aberta(s)</span>
                <span className={c.overdueTasks ? 'font-medium text-red-600' : ''}>{c.overdueTasks} atrasada(s)</span>
              </div>
              {tab === 'archived' && (
                <div className="mt-3 flex gap-2">
                  <Button size="sm" onClick={() => call('companies.restore', { id: c.id })}>Restaurar</Button>
                  <Button size="sm" variant="ghost" className="text-red-600" onClick={() => d.deleteCompany(c)}>Excluir</Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
