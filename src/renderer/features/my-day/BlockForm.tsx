import { useEffect, useState } from 'react'
import { Search } from 'lucide-react'
import type { ApiMethods } from '@shared/api'
import { addMinutes, fromMinutes, toMinutes } from '@shared/day'
import { Button, Dot, Field, Input, Modal, PriorityBadge, Select, Textarea, useConfirm } from '../../components/ui'
import { ColorChoice } from '../../components/ColorChoice'
import { useApiQuery, useCall } from '../../lib/queries'
import { cx, formatShort } from '../../lib/format'

type Block = ApiMethods['dayBlocks.list']['output'][number]
export type BlockDraft = { date: string; startTime: string; endTime: string; taskId?: number | null; block?: Block }

export const TIME_OPTIONS = Array.from({ length: 97 }, (_, i) => fromMinutes(i * 15))

export function BlockForm({ draft, onClose }: { draft: BlockDraft; onClose: () => void }) {
  const editing = draft.block
  const [kind, setKind] = useState<'task' | 'activity'>(editing && !editing.taskId ? 'activity' : 'task')
  const [start, setStart] = useState(editing?.startTime ?? draft.startTime)
  const [end, setEnd] = useState(editing?.endTime ?? draft.endTime)
  const [taskId, setTaskId] = useState<number | null>(editing?.taskId ?? draft.taskId ?? null)
  const [title, setTitle] = useState(editing && !editing.taskId ? editing.title ?? '' : '')
  const [note, setNote] = useState(editing?.note ?? '')
  const [color, setColor] = useState<string | null>(editing?.color ?? null)
  const [q, setQ] = useState('')
  const call = useCall()
  const confirm = useConfirm()
  const { data: results } = useApiQuery('tasks.query', { filter: { includeDone: false, text: q || undefined }, sort: 'due', limit: 40 }, { enabled: kind === 'task' })
  const { data: chosen } = useApiQuery('tasks.get', { id: taskId ?? 0 }, { enabled: kind === 'task' && taskId != null })

  useEffect(() => {
    if (toMinutes(end) <= toMinutes(start)) setEnd(addMinutes(start, Math.min(60, 1440 - toMinutes(start))))
  }, [start, end])

  const valid = toMinutes(end) > toMinutes(start) && (kind === 'task' ? taskId != null : title.trim().length > 0)
  const save = async () => {
    const payload = { startTime: start, endTime: end, taskId: kind === 'task' ? taskId : null, title: kind === 'activity' ? title : null, note, color }
    if (editing) await call('dayBlocks.update', { id: editing.id, ...payload })
    else await call('dayBlocks.create', { date: draft.date, ...payload })
    onClose()
  }

  return (
    <Modal open onClose={onClose} title={editing ? 'Editar bloco' : 'Novo bloco'} width="max-w-xl" testId="block-form">
      <div className="space-y-4">
        <div className="flex overflow-hidden rounded-[5px] border border-[var(--line-strong)] text-sm">
          {(['task', 'activity'] as const).map((k) => (
            <button key={k} type="button" data-testid={`block-kind-${k}`} onClick={() => setKind(k)} className={cx('flex-1 py-1.5', kind === k ? 'bg-indigo-500/10 font-medium text-indigo-700 dark:text-indigo-300' : 'hover:bg-zinc-100 dark:hover:bg-zinc-800')}>
              {k === 'task' ? 'Tarefa existente' : 'Atividade livre'}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Início">
            <Select data-testid="block-start" className="w-full" value={start} onChange={(e) => setStart(e.target.value)}>
              {TIME_OPTIONS.slice(0, -1).map((t) => <option key={t} value={t}>{t}</option>)}
            </Select>
          </Field>
          <Field label="Fim">
            <Select data-testid="block-end" className="w-full" value={end} onChange={(e) => setEnd(e.target.value)}>
              {TIME_OPTIONS.filter((t) => toMinutes(t) > toMinutes(start)).map((t) => <option key={t} value={t}>{t}</option>)}
            </Select>
          </Field>
        </div>
        {kind === 'task' ? (
          <div className="space-y-2">
            {chosen && taskId != null && (
              <div className="flex items-center gap-2 rounded-[5px] border border-indigo-500/40 bg-indigo-500/[.06] px-3 py-2 text-sm">
                <Dot color={chosen.company.color} size={8} />
                <span className="min-w-0 flex-1 truncate font-medium">{chosen.title}</span>
                <span className="truncate text-xs text-zinc-500">{chosen.project.name}</span>
              </div>
            )}
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-2.5 text-zinc-400" />
              <Input data-testid="block-task-search" className="pl-8" placeholder="Buscar tarefa pelo título…" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <div className="max-h-56 space-y-0.5 overflow-y-auto rounded-[5px] border border-[var(--line)] p-1">
              {results?.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  data-testid={`block-task-option-${t.id}`}
                  onClick={() => setTaskId(t.id)}
                  className={cx('flex w-full items-center gap-2 rounded-[4px] px-2 py-1.5 text-left text-sm', taskId === t.id ? 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-300' : 'hover:bg-zinc-100 dark:hover:bg-zinc-800')}
                >
                  <Dot color={t.companyColor} size={7} />
                  <span className="min-w-0 flex-1 truncate">{t.title}</span>
                  <span className="truncate text-xs text-zinc-500">{t.projectName}</span>
                  <PriorityBadge priority={t.priority} />
                  {t.dueAt && <span className={cx('w-14 text-right text-xs', t.isOverdue ? 'text-red-600' : 'text-zinc-500')}>{formatShort(t.dueAt)}</span>}
                </button>
              ))}
              {results && !results.length && <div className="p-3 text-center text-xs text-zinc-500">Nenhuma tarefa aberta encontrada.</div>}
            </div>
          </div>
        ) : (
          <Field label="Atividade">
            <Input data-testid="block-title" placeholder="Ex.: Almoço, Reunião com equipe…" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
          </Field>
        )}
        <Field label="Observação">
          <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Opcional" />
        </Field>
        <div className="flex flex-col gap-1.5 text-xs font-medium text-zinc-500">
          Cor do bloco
          <ColorChoice value={color} onChange={setColor} />
        </div>
        <div className="flex items-center justify-between gap-2 pt-1">
          {editing ? (
            <Button
              variant="ghost"
              className="!text-red-600"
              data-testid="block-delete"
              onClick={async () => {
                if (await confirm({ title: 'Remover este bloco?', description: 'A tarefa original não é alterada.', confirmLabel: 'Remover', danger: true })) {
                  await call('dayBlocks.delete', { id: editing.id })
                  onClose()
                }
              }}
            >
              Remover bloco
            </Button>
          ) : <span />}
          <div className="flex gap-2">
            <Button onClick={onClose}>Cancelar</Button>
            <Button variant="primary" data-testid="block-save" disabled={!valid} onClick={save}>Salvar</Button>
          </div>
        </div>
      </div>
    </Modal>
  )
}
