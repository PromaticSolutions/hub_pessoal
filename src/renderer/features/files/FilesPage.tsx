import { PageHeader } from '../../components/ui'
import { FilesTable } from './FilesTable'

export default function FilesPage() {
  return (
    <div className="flex-1 overflow-y-auto">
      <PageHeader title="Arquivos" />
      <div className="px-6 pb-6 pt-2"><div className="surface p-5"><FilesTable /></div></div>
    </div>
  )
}
