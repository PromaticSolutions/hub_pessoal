import { useEffect, useState } from 'react'
import type { ApiMethods } from '@shared/api'
import { Button, Field, Modal, Select } from '../../components/ui'
import { useApiQuery, useCall } from '../../lib/queries'

type Tree = ApiMethods['spaces.tree']['output']
type TaskDetail = ApiMethods['tasks.get']['output']

function projectsOf(space: Tree[number] | undefined) {
  if (!space) return []
  const out = [...space.projects]
  const walk = (fs: Tree[number]['folders']) => fs.forEach((f) => { out.push(...f.projects); walk(f.children) })
  walk(space.folders)
  return out
}

export function MoveTaskDialog({ task, onClose }: { task: TaskDetail; onClose: () => void }) {
  const { data: tree } = useApiQuery('spaces.tree', {})
  const [companyId, setCompanyId] = useState(task.company.id)
  const [projectId, setProjectId] = useState(task.project.id)
  const [boardId, setBoardId] = useState(task.board.id)
  const [columnId, setColumnId] = useState(task.columnId)
  const { data: boards } = useApiQuery('boards.list', { projectId })
  const { data: board } = useApiQuery('boards.get', { id: boardId })
  const call = useCall()
  const projects = projectsOf(tree?.find((s) => s.company.id === companyId))

  useEffect(() => {
    if (boards && !boards.some((b) => b.id === boardId) && boards[0]) setBoardId(boards[0].id)
  }, [boards, boardId])
  useEffect(() => {
    if (board && board.board.id === boardId && !board.columns.some((c) => c.id === columnId) && board.columns[0]) setColumnId(board.columns[0].id)
  }, [board, boardId, columnId])

  return (
    <Modal open onClose={onClose} title="Mover cartão" testId="move-dialog">
      <div className="space-y-3">
        <Field label="Espaço">
          <Select className="w-full" value={companyId} onChange={(e) => { const id = Number(e.target.value); setCompanyId(id); const p = projectsOf(tree?.find((s) => s.company.id === id))[0]; if (p) setProjectId(p.id) }}>
            {tree?.map((s) => <option key={s.company.id} value={s.company.id}>{s.company.name}</option>)}
          </Select>
        </Field>
        <Field label="Projeto">
          <Select data-testid="move-project" className="w-full" value={projectId} onChange={(e) => setProjectId(Number(e.target.value))}>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
        </Field>
        <Field label="Quadro">
          <Select className="w-full" value={boardId} onChange={(e) => setBoardId(Number(e.target.value))}>
            {boards?.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </Select>
        </Field>
        <Field label="Coluna">
          <Select data-testid="move-column" className="w-full" value={columnId} onChange={(e) => setColumnId(Number(e.target.value))}>
            {board?.columns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </Field>
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Cancelar</Button>
          <Button
            data-testid="move-ok"
            variant="primary"
            disabled={!board || board.board.id !== boardId || !board.columns.some((c) => c.id === columnId)}
            onClick={async () => {
              const last = board!.cards.filter((c) => c.columnId === columnId && c.id !== task.id).at(-1)
              await call('tasks.move', { id: task.id, columnId, beforeId: last?.id ?? null, afterId: null })
              onClose()
            }}
          >
            Mover
          </Button>
        </div>
      </div>
    </Modal>
  )
}
