import type { Priority, TaskFilter } from '@shared/types'
import type { ApiMethods } from '@shared/api'
import { PRIORITIES, PRIORITY_LABELS } from '@shared/constants'
import { Button, Select } from '../../components/ui'
import { useApiQuery } from '../../lib/queries'

type Tree = ApiMethods['spaces.tree']['output']

export function allProjects(tree: Tree | undefined) {
  const out: { id: number; name: string; companyId: number }[] = []
  for (const s of tree ?? []) {
    const walk = (fs: Tree[number]['folders']) => fs.forEach((f) => { out.push(...f.projects); walk(f.children) })
    out.push(...s.projects)
    walk(s.folders)
  }
  return out
}

/** Compact filter bar shared by Minha semana, Calendário and Dashboard. */
export function TaskFilters({ value, onChange, showDone = true }: { value: TaskFilter; onChange: (f: TaskFilter) => void; showDone?: boolean }) {
  const { data: tree } = useApiQuery('spaces.tree', {})
  const companyId = value.companyIds?.[0] ?? ''
  const projects = allProjects(tree).filter((p) => !companyId || p.companyId === companyId)
  const active = !!(value.companyIds?.length || value.projectIds?.length || value.priorities?.length || (value.scope && value.scope !== 'all'))
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select data-testid="filter-scope" value={value.scope ?? 'all'} onChange={(e) => onChange({ ...value, scope: e.target.value as TaskFilter['scope'] })}>
        <option value="all">Pessoal + profissional</option>
        <option value="personal">Só pessoal</option>
        <option value="professional">Só profissional</option>
      </Select>
      <Select
        data-testid="filter-company"
        value={companyId}
        onChange={(e) => onChange({ ...value, companyIds: e.target.value ? [Number(e.target.value)] : undefined, projectIds: undefined })}
      >
        <option value="">Todos os espaços</option>
        {tree?.map((s) => <option key={s.company.id} value={s.company.id}>{s.company.name}</option>)}
      </Select>
      <Select data-testid="filter-project" value={value.projectIds?.[0] ?? ''} onChange={(e) => onChange({ ...value, projectIds: e.target.value ? [Number(e.target.value)] : undefined })}>
        <option value="">Todos os projetos</option>
        {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </Select>
      <Select data-testid="filter-priority" value={value.priorities?.[0] ?? ''} onChange={(e) => onChange({ ...value, priorities: e.target.value ? [e.target.value as Priority] : undefined })}>
        <option value="">Todas as prioridades</option>
        {PRIORITIES.map((p) => <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>)}
      </Select>
      {showDone && (
        <label className="flex items-center gap-1 text-xs text-zinc-500">
          <input type="checkbox" checked={value.includeDone !== false} onChange={(e) => onChange({ ...value, includeDone: e.target.checked })} /> mostrar concluídas
        </label>
      )}
      {active && <Button size="sm" variant="ghost" onClick={() => onChange({ includeDone: value.includeDone })}>Limpar filtros</Button>}
    </div>
  )
}
