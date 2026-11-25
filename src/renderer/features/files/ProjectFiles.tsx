import { Paperclip } from 'lucide-react'
import { Button } from '../../components/ui'
import { api } from '../../lib/api'
import { useCall } from '../../lib/queries'
import { FilesTable } from './FilesTable'

export function ProjectFiles({ projectId }: { projectId: number }) {
  const call = useCall()
  return (
    <div className="flex-1 space-y-3 overflow-y-auto p-6" data-testid={`project-files-${projectId}`}>
      <Button
        data-testid="project-add-file"
        onClick={async () => {
          const paths = await api('system.pickFiles', { multiple: true })
          if (paths.length) await call('attachments.add', { projectId, sourcePaths: paths })
        }}
      >
        <Paperclip size={14} /> Adicionar arquivo ao projeto
      </Button>
      <FilesTable fixedProjectId={projectId} />
    </div>
  )
}
