import { useRef } from 'react'
import { Paperclip } from 'lucide-react'
import { Button } from '../../components/ui'
import { useAttachmentActions } from '../../lib/attachments'
import { FilesTable } from './FilesTable'

export function ProjectFiles({ projectId }: { projectId: number }) {
  const files = useAttachmentActions()
  const inputRef = useRef<HTMLInputElement>(null)
  return (
    <div className="flex-1 space-y-3 overflow-y-auto p-6" data-testid={`project-files-${projectId}`}>
      <Button data-testid="project-add-file" onClick={() => inputRef.current?.click()}>
        <Paperclip size={14} /> Adicionar arquivo ao projeto
      </Button>
      <input
        ref={inputRef}
        type="file"
        multiple
        hidden
        data-testid="project-file-input"
        onChange={(e) => { files.add({ projectId }, Array.from(e.target.files ?? [])); e.target.value = '' }}
      />
      <FilesTable fixedProjectId={projectId} />
    </div>
  )
}
