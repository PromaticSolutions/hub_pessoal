import { useEffect, useState } from 'react'
import type { Priority } from '@shared/types'
import { PRIORITIES, PRIORITY_LABELS } from '@shared/constants'
import { Button, Field, Input, Modal, Select } from '../../components/ui'
import { useApiQuery, useCall } from '../../lib/queries'
import { allProjects } from './TaskFilters'
import { DateTimeField } from '../task-modal/TaskModal'

export function QuickCreateTask({ open, onClose, initialDue }: { open: boolean; onClose: () => void; initialDue?: string | null }) {
  const { data: tree } = useApiQuery('spaces.tree', {})
  const { data: last } = useApiQuery('settings.get', { key: 'lastProjectId' })
  const projects = allProjects(tree)
  const [title, setTitle] = useState('')
  const [projectId, setProjectId] = useState<number | ''>('')
  const [dueAt, setDueAt] = useState<string | null>(null)
  const [priority, setPriority] = useState<Priority>('medium')
  const call = useCall()
  useEffect(() => {
    if (!open) return
    setTitle('')
    setDueAt(initialDue ?? null)
    setPriority('medium')
    const lastId = typeof last === 'number' && projects.some((p) => p.id === last) ? last : projects[0]?.id
    setProjectId(lastId ?? '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialDue, last, tree])
  const spaceName = (cid: number) => tree?.find((s) => s.company.id === cid)?.company.name
  return (
    <Modal open={open} onClose={onClose} title="Nova tarefa" testId="quick-create">
      {!projects.length ? (
        <div className="text-sm text-zinc-500">Crie um projeto primeiro (no menu lateral, em Espaços).</div>
      ) : (
        <form
          className="space-y-3"
          onSubmit={async (e) => {
            e.preventDefault()
            if (!title.trim() || !projectId) return
            await call('tasks.quickCreate', { projectId: Number(projectId), title, dueAt, priority })
            onClose()
          }}
        >
          <Field label="Título *"><Input data-testid="quick-title" autoFocus value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
          <Field label="Projeto">
            <Select data-testid="quick-project" className="w-full" value={projectId} onChange={(e) => setProjectId(Number(e.target.value))}>
              {projects.map((p) => <option key={p.id} value={p.id}>{spaceName(p.companyId)} › {p.name}</option>)}
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Vencimento"><DateTimeField value={dueAt} onChange={setDueAt} /></Field>
            <Field label="Prioridade">
              <Select className="w-full" value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
                {PRIORITIES.map((p) => <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>)}
              </Select>
            </Field>
          </div>
          <div className="flex justify-end gap-2">
            <Button onClick={onClose}>Cancelar</Button>
            <Button data-testid="quick-save" type="submit" variant="primary" disabled={!title.trim()}>Criar</Button>
          </div>
        </form>
      )}
    </Modal>
  )
}
