import { PageHeader } from '../../components/ui'
import { FilesTable } from './FilesTable'

export default function FilesPage() {
  return (
    <div className="flex-1 overflow-y-auto">
      <PageHeader title="Arquivos" />
      <div className="p-6"><FilesTable /></div>
    </div>
  )
}
