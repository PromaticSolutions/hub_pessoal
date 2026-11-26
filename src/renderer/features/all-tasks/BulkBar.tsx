import { useState } from 'react'
import { Archive, ArchiveRestore, Trash2, X } from 'lucide-react'
import type { BulkAction, ColumnCategory, Priority } from '@shared/types'
import { PRIORITIES, PRIORITY_LABELS } from '@shared/constants'
import { Button, Input, Select, useConfirm } from '../../components/ui'
import { useApiQuery, useCall } from '../../lib/queries'
import { useToast } from '../../components/toast'
import { allProjects } from '../week/TaskFilters'

export function BulkBar({ ids, onDone }: { ids: number[]; onDone: () => void }) {
  const call = useCall()
  const confirm = useConfirm()
  const toast = useToast()
  const { data: tree } = useApiQuery('spaces.tree', {})
  const [due, setDue] = useState('')
  const spaceName = (cid: number) => tree?.find((s) => s.company.id === cid)?.company.name ?? ''

  const run = async (action: BulkAction, label: string) => {
    const r = await call('tasks.bulk', { ids, action })
    toast.success(`${label}: ${r.updated} tarefa(s)${r.skipped ? ` · ${r.skipped} ignorada(s)` : ''}`)
    if (action.kind === 'delete' || action.kind === 'move') onDone()
  }

  return (
    <div className="glass pop-in fixed bottom-5 left-1/2 z-40 flex max-w-[calc(100%-32px)] -translate-x-1/2 flex-wrap items-center gap-2 rounded-md px-3 py-2 shadow-[var(--shadow-3)]" data-testid="bulk-bar">
      <span className="mr-1 text-sm font-semibold">{ids.length} selecionada(s)</span>
      <Select data-testid="bulk-status" value="" onChange={(e) => e.target.value && run({ kind: 'status', status: e.target.value as ColumnCategory }, 'Status alterado')}>
        <option value="">Status…</option>
        <option value="todo">A fazer</option>
        <option value="in_progress">Em andamento</option>
            <option value="review">Em validação</option>
        <option value="done">Concluído</option>
      </Select>
      <Select data-testid="bulk-priority" value="" onChange={(e) => e.target.value && run({ kind: 'priority', priority: e.target.value as Priority }, 'Prioridade alterada')}>
        <option value="">Prioridade…</option>
        {PRIORITIES.map((p) => <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>)}
      </Select>
      <div className="flex items-center gap-1">
        <Input data-testid="bulk-due" type="date" className="w-36" value={due} onChange={(e) => setDue(e.target.value)} aria-label="Novo vencimento" />
        <Button size="sm" data-testid="bulk-due-apply" disabled={!due} onClick={() => run({ kind: 'due', dueAt: due }, 'Vencimento definido')}>Aplicar</Button>
        <Button size="sm" variant="ghost" onClick={() => run({ kind: 'due', dueAt: null }, 'Vencimento removido')}>Sem prazo</Button>
      </div>
      <Select data-testid="bulk-move" value="" onChange={(e) => e.target.value && run({ kind: 'move', projectId: Number(e.target.value) }, 'Movidas')}>
        <option value="">Mover para…</option>
        {allProjects(tree).map((p) => <option key={p.id} value={p.id}>{spaceName(p.companyId)} › {p.name}</option>)}
      </Select>
      <Button size="sm" data-testid="bulk-archive" onClick={() => run({ kind: 'archive' }, 'Arquivadas')}><Archive size={14} /> Arquivar</Button>
      <Button size="sm" onClick={() => run({ kind: 'restore' }, 'Restauradas')}><ArchiveRestore size={14} /> Restaurar</Button>
      <Button
        size="sm"
        data-testid="bulk-delete"
        className="!text-red-600"
        onClick={async () => {
          if (await confirm({ title: `Excluir ${ids.length} tarefa(s) permanentemente?`, description: 'Comentários, checklists e anexos dessas tarefas também serão apagados. Esta ação não pode ser desfeita.', danger: true, confirmLabel: `Excluir ${ids.length}` }))
            await run({ kind: 'delete' }, 'Excluídas')
        }}
      >
        <Trash2 size={14} /> Excluir
      </Button>
      <button className="ml-1 rounded p-1 text-zinc-500 hover:bg-zinc-200/60" aria-label="Limpar seleção" onClick={onDone}><X size={14} /></button>
    </div>
  )
}
