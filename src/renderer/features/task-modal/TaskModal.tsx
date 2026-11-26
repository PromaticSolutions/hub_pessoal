import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Archive, Copy, ExternalLink, FolderOpen, Paperclip, Trash2, X } from 'lucide-react'
import type { ActivityEntry, Attachment, ColumnCategory, Priority } from '@shared/types'
import { CATEGORIES, CATEGORY_LABELS, PRIORITIES, PRIORITY_LABELS, SPACE_COLORS } from '@shared/constants'
import { Button, Dot, Field, Input, Modal, Select, Tabs, Textarea, useConfirm } from '../../components/ui'
import { useApiQuery, useCall } from '../../lib/queries'
import { api, type In } from '../../lib/api'
import { useQueryClient } from '@tanstack/react-query'
import { cx, formatBytes, formatDate } from '../../lib/format'
import { useToast } from '../../components/toast'
import { MoveTaskDialog } from './MoveTaskDialog'
import { ColorChoice } from '../../components/ColorChoice'
import { flushAll, registerFlusher, track } from '../../lib/flush'

/* ---------- host: opens when ?task=<id> ---------- */

export function TaskModalHost() {
  const [params, setParams] = useSearchParams()
  const id = Number(params.get('task'))
  const close = useCallback(() => {
    const p = new URLSearchParams(params)
    p.delete('task')
    setParams(p)
  }, [params, setParams])
  if (!id) return null
  return <TaskModal key={id} taskId={id} onClose={close} />
}

/* ---------- date field with optional time ---------- */

export function DateTimeField({ value, onChange, testId }: { value: string | null; onChange: (v: string | null) => void; testId?: string }) {
  const hasTime = !!value && value.length > 10
  return (
    <div className="flex items-center gap-2">
      <Input
        data-testid={testId}
        type={hasTime ? 'datetime-local' : 'date'}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value || null)}
      />
      <label className="flex shrink-0 items-center gap-1 text-[11px] text-zinc-500">
        <input
          type="checkbox"
          checked={hasTime}
          disabled={!value}
          onChange={(e) => value && onChange(e.target.checked ? `${value.slice(0, 10)}T09:00` : value.slice(0, 10))}
        />
        hora
      </label>
    </div>
  )
}

/* ---------- activity text ---------- */

const FIELD_LABELS: Record<string, string> = { title: 'Título', description: 'Descrição', priority: 'Prioridade', startAt: 'Início', dueAt: 'Vencimento', labels: 'Etiquetas', column: 'Coluna' }

function fmtVal(field: string | null, v: string | null): string {
  if (v == null || v === '') return '—'
  if (field === 'priority') return PRIORITY_LABELS[v as Priority] ?? v
  if (field === 'startAt' || field === 'dueAt') return formatDate(v)
  return v
}

export function activityText(a: ActivityEntry): string {
  switch (a.action) {
    case 'created': return 'Cartão criado'
    case 'duplicated': return 'Criado como cópia de outro cartão'
    case 'moved': return `Movido de "${a.oldValue}" para "${a.newValue}"`
    case 'archived': return 'Arquivado'
    case 'restored': return 'Restaurado'
    case 'commented': return `Comentou: "${a.newValue}"`
    case 'attachment_added': return `Anexou "${a.newValue}"`
    case 'attachment_removed': return `Removeu o anexo "${a.oldValue}"`
    case 'checklist_item_done': return `Concluiu o item "${a.newValue}"`
    case 'updated':
      if (a.field === 'description') return 'Descrição alterada'
      return `${FIELD_LABELS[a.field ?? ''] ?? a.field}: ${fmtVal(a.field, a.oldValue)} → ${fmtVal(a.field, a.newValue)}`
    default: return a.action
  }
}

/* ---------- sections ---------- */

function Section({ title, children, actions }: { title: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="section-title">{title}</h3>
        {actions}
      </div>
      {children}
    </section>
  )
}

function ChecklistSection({ taskId, checklists }: { taskId: number; checklists: { id: number; title: string; items: { id: number; text: string; done: boolean }[] }[] }) {
  const call = useCall()
  const confirm = useConfirm()
  const [drafts, setDrafts] = useState<Record<number, string>>({})
  return (
    <Section title="Checklists" actions={<Button size="sm" data-testid="add-checklist" onClick={() => call('checklists.add', { taskId })}>+ Checklist</Button>}>
      {checklists.map((cl) => {
        const done = cl.items.filter((i) => i.done).length
        const pct = cl.items.length ? Math.round((done / cl.items.length) * 100) : 0
        return (
          <div key={cl.id} className="space-y-1.5 rounded-[5px] bg-zinc-50 p-2.5 dark:bg-zinc-800/40">
            <div className="flex items-center gap-2">
              <input
                className="flex-1 bg-transparent text-sm font-medium outline-none"
                defaultValue={cl.title}
                onBlur={(e) => e.target.value.trim() && e.target.value !== cl.title && call('checklists.rename', { id: cl.id, title: e.target.value })}
              />
              <span className="text-xs text-zinc-500">{pct}%</span>
              <button
                className="text-zinc-400 hover:text-red-600"
                title="Excluir checklist"
                onClick={async () => (await confirm({ title: 'Excluir checklist?', description: `"${cl.title}" e seus itens serão apagados.`, danger: true, confirmLabel: 'Excluir' })) && call('checklists.delete', { id: cl.id })}
              >
                <Trash2 size={14} />
              </button>
            </div>
            <div className="h-1 overflow-hidden rounded bg-zinc-200 dark:bg-zinc-800"><div className="h-full bg-emerald-500" style={{ width: `${pct}%` }} /></div>
            {cl.items.map((it, idx) => (
              <div key={it.id} className="group flex items-center gap-2 text-sm">
                <input key={`${it.id}-${it.done}`} type="checkbox" data-testid={`check-item-${it.id}`} defaultChecked={it.done} onChange={(e) => call('checklistItems.update', { id: it.id, done: e.target.checked })} />
                <input
                  className={cx('flex-1 bg-transparent outline-none', it.done && 'text-zinc-400 line-through')}
                  defaultValue={it.text}
                  onBlur={(e) => e.target.value.trim() && e.target.value !== it.text && call('checklistItems.update', { id: it.id, text: e.target.value })}
                />
                <div className="invisible flex gap-1 text-xs text-zinc-400 group-hover:visible">
                  {idx > 0 && <button title="Subir" onClick={() => call('checklistItems.move', { id: it.id, checklistId: cl.id, beforeId: cl.items[idx - 2]?.id ?? null, afterId: cl.items[idx - 1].id })}>↑</button>}
                  {idx < cl.items.length - 1 && <button title="Descer" onClick={() => call('checklistItems.move', { id: it.id, checklistId: cl.id, beforeId: cl.items[idx + 1].id, afterId: cl.items[idx + 2]?.id ?? null })}>↓</button>}
                  <button title="Excluir" className="hover:text-red-600" onClick={() => call('checklistItems.delete', { id: it.id })}><X size={12} /></button>
                </div>
              </div>
            ))}
            <form
              onSubmit={async (e) => {
                e.preventDefault()
                const text = drafts[cl.id]?.trim()
                if (!text) return
                await call('checklistItems.add', { checklistId: cl.id, text })
                setDrafts((d) => ({ ...d, [cl.id]: '' }))
              }}
            >
              <Input data-testid={`checklist-new-${cl.id}`} placeholder="Adicionar item (Enter)" value={drafts[cl.id] ?? ''} onChange={(e) => setDrafts((d) => ({ ...d, [cl.id]: e.target.value }))} />
            </form>
          </div>
        )
      })}
    </Section>
  )
}

function AttachmentThumb({ a }: { a: Attachment }) {
  const isImg = a.mimeType.startsWith('image/')
  const { data } = useApiQuery('attachments.thumbnail', { id: a.id }, { enabled: isImg })
  if (isImg && data) return <img src={data} alt="" className="h-10 w-10 rounded object-cover" />
  return <div className="flex h-10 w-10 items-center justify-center rounded bg-zinc-100 text-[10px] font-semibold uppercase text-zinc-500 dark:bg-zinc-800">{a.originalName.split('.').pop()?.slice(0, 4)}</div>
}

function AttachmentsSection({ taskId, attachments }: { taskId: number; attachments: Attachment[] }) {
  const call = useCall()
  const confirm = useConfirm()
  const inputRef = useRef<HTMLInputElement>(null)
  const addPaths = (paths: string[]) => paths.length && call('attachments.add', { taskId, sourcePaths: paths })
  return (
    <Section
      title="Anexos"
      actions={
        <>
          <Button size="sm" data-testid="add-attachment" onClick={async () => addPaths(await api('system.pickFiles', { multiple: true }))}>
            <Paperclip size={12} /> Adicionar
          </Button>
          <input
            ref={inputRef}
            type="file"
            multiple
            hidden
            data-testid="attach-input"
            onChange={(e) => {
              const files = Array.from(e.target.files ?? [])
              addPaths(files.map((f) => window.api.getPathForFile(f)).filter(Boolean))
              e.target.value = ''
            }}
          />
        </>
      }
    >
      {!attachments.length && <div className="rounded-md border border-dashed border-zinc-300 p-3 text-center text-xs text-zinc-500 dark:border-zinc-700">Arraste arquivos para cá ou clique em Adicionar.</div>}
      <div className="space-y-1">
        {attachments.map((a) => (
          <div key={a.id} data-testid={`attachment-${a.id}`} className="group flex items-center gap-2 rounded p-1 hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
            <AttachmentThumb a={a} />
            <button className="min-w-0 flex-1 text-left" onClick={() => call('attachments.open', { id: a.id })}>
              <div className="truncate text-sm">{a.originalName}</div>
              <div className="text-xs text-zinc-500">{formatBytes(a.sizeBytes)} · {formatDate(a.createdAt)}</div>
            </button>
            <div className="invisible flex gap-1 group-hover:visible">
              <button title="Abrir" onClick={() => call('attachments.open', { id: a.id })}><ExternalLink size={14} /></button>
              <button title="Mostrar na pasta" onClick={() => call('attachments.reveal', { id: a.id })}><FolderOpen size={14} /></button>
              <button
                title="Remover"
                className="hover:text-red-600"
                onClick={async () => (await confirm({ title: 'Remover anexo?', description: `"${a.originalName}" será removido do cartão.`, danger: true, confirmLabel: 'Remover' })) && call('attachments.delete', { id: a.id })}
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </Section>
  )
}

function ActivitySection({ taskId, comments }: { taskId: number; comments: { id: number; body: string; createdAt: string; updatedAt: string }[] }) {
  const [tab, setTab] = useState<'comments' | 'history'>('comments')
  const [body, setBody] = useState('')
  const [editing, setEditing] = useState<number | null>(null)
  const [editBody, setEditBody] = useState('')
  const { data: history } = useApiQuery('activity.list', { taskId }, { enabled: tab === 'history' })
  const call = useCall()
  const confirm = useConfirm()
  const send = async () => {
    if (!body.trim()) return
    await call('comments.add', { taskId, body })
    setBody('')
  }
  return (
    <section className="space-y-2">
      <Tabs value={tab} onChange={setTab} tabs={[{ value: 'comments', label: `Comentários (${comments.length})` }, { value: 'history', label: 'Histórico' }]} />
      {tab === 'comments' ? (
        <div className="space-y-3">
          <div>
            <Textarea data-testid="comment-input" rows={2} placeholder="Escrever comentário… (Ctrl+Enter envia)" value={body} onChange={(e) => setBody(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && e.ctrlKey && send()} />
            <div className="mt-1 flex justify-end"><Button size="sm" variant="primary" data-testid="comment-send" disabled={!body.trim()} onClick={send}>Comentar</Button></div>
          </div>
          {[...comments].reverse().map((c) => (
            <div key={c.id} className="group rounded-[5px] bg-zinc-50 p-2.5 text-sm dark:bg-zinc-800/50">
              <div className="mb-1 flex items-center justify-between text-xs text-zinc-500">
                <span>{formatDate(c.createdAt)}{c.updatedAt !== c.createdAt && ' (editado)'}</span>
                <span className="invisible flex gap-2 group-hover:visible">
                  <button onClick={() => { setEditing(c.id); setEditBody(c.body) }}>Editar</button>
                  <button className="hover:text-red-600" onClick={async () => (await confirm({ title: 'Excluir comentário?', danger: true, confirmLabel: 'Excluir' })) && call('comments.delete', { id: c.id })}>Excluir</button>
                </span>
              </div>
              {editing === c.id ? (
                <div className="space-y-1">
                  <Textarea rows={2} value={editBody} onChange={(e) => setEditBody(e.target.value)} />
                  <div className="flex justify-end gap-1">
                    <Button size="sm" onClick={() => setEditing(null)}>Cancelar</Button>
                    <Button size="sm" variant="primary" onClick={async () => { await call('comments.update', { id: c.id, body: editBody }); setEditing(null) }}>Salvar</Button>
                  </div>
                </div>
              ) : (
                <div className="whitespace-pre-wrap break-words">{c.body}</div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <ul className="space-y-1 text-sm" data-testid="history-list">
          {history?.map((a) => (
            <li key={a.id} className="flex gap-2">
              <span className="shrink-0 text-xs text-zinc-500">{formatDate(a.createdAt)}</span>
              <span>{activityText(a)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function LabelPicker({ taskId, selected }: { taskId: number; selected: number[] }) {
  const { data: labels } = useApiQuery('labels.list', {})
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const call = useCall()
  const toggle = (id: number) => call('tasks.setLabels', { id: taskId, labelIds: selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id] })
  return (
    <div className="relative">
      <Button size="sm" data-testid="labels-button" onClick={() => setOpen((o) => !o)}>Editar etiquetas</Button>
      {open && (
        <div className="surface-overlay absolute right-0 z-20 mt-1 w-60 space-y-1 p-2">
          {labels?.map((l) => (
            <label key={l.id} className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={selected.includes(l.id)} onChange={() => toggle(l.id)} />
              <span className="rounded px-1.5 text-xs text-white" style={{ background: l.color }}>{l.name}</span>
            </label>
          ))}
          <form
            className="flex gap-1 pt-1"
            onSubmit={async (e) => {
              e.preventDefault()
              if (!name.trim()) return
              const l = await call('labels.create', { name, color: SPACE_COLORS[(labels?.length ?? 0) % SPACE_COLORS.length] })
              await call('tasks.setLabels', { id: taskId, labelIds: [...selected, l.id] })
              setName('')
            }}
          >
            <Input data-testid="new-label-input" placeholder="Nova etiqueta" value={name} onChange={(e) => setName(e.target.value)} />
            <Button size="sm" type="submit">+</Button>
          </form>
          <div className="pt-1 text-right"><button className="text-xs text-zinc-500" onClick={() => setOpen(false)}>Fechar</button></div>
        </div>
      )}
    </div>
  )
}

/* ---------- modal ---------- */

export function TaskModal({ taskId, onClose }: { taskId: number; onClose: () => void }) {
  const { data: t, error } = useApiQuery('tasks.get', { id: taskId })
  const call = useCall()
  const confirm = useConfirm()
  const toast = useToast()
  const [title, setTitle] = useState('')
  const [desc, setDesc] = useState('')
  const [preview, setPreview] = useState(true)
  const [saved, setSaved] = useState(false)
  const [moving, setMoving] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const pending = useRef<{ title?: string; description?: string }>({})
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const loaded = useRef(false)
  const qc = useQueryClient()

  useEffect(() => {
    if (t && !loaded.current) {
      loaded.current = true
      setTitle(t.title)
      setDesc(t.description)
      setPreview(!!t.description)
    }
  }, [t])

  const flush = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    const p = pending.current
    pending.current = {}
    if (p.title !== undefined && !p.title.trim()) delete p.title
    if (!Object.keys(p).length) return
    try {
      await track(api('tasks.update', { id: taskId, ...p }))
      setSaved(true)
      setTimeout(() => setSaved(false), 1500)
    } catch (e) {
      toast.error((e as Error).message)
    }
  }, [taskId, toast])

  useEffect(() => registerFlusher(flush), [flush])

  const queue = (patch: { title?: string; description?: string }) => {
    pending.current = { ...pending.current, ...patch }
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => { flush().then(() => qc.invalidateQueries()) }, 800)
  }

  const close = async () => {
    await flushAll()
    await qc.invalidateQueries()
    onClose()
  }

  if (error) return <Modal open onClose={onClose} title="Cartão não encontrado"><div className="text-sm">Este cartão não existe mais.</div></Modal>
  if (!t) return null

  const update = (patch: Omit<In<'tasks.update'>, 'id'>) =>
    call('tasks.update', { id: taskId, ...patch }).then(() => { setSaved(true); setTimeout(() => setSaved(false), 1500) })

  return (
    <div className="backdrop fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-6" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div
        data-testid="task-modal"
        className={cx('surface-overlay relative w-full max-w-5xl', dragOver && 'ring-4 ring-indigo-400')}
        onKeyDown={(e) => e.key === 'Escape' && close()}
        onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setDragOver(true) } }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          if (!e.dataTransfer.files.length) return
          e.preventDefault()
          setDragOver(false)
          const paths = Array.from(e.dataTransfer.files).map((f) => window.api.getPathForFile(f)).filter(Boolean)
          if (paths.length) call('attachments.add', { taskId, sourcePaths: paths })
        }}
        tabIndex={-1}
      >
        <div className="flex items-center gap-2 border-b border-[var(--line)] px-5 py-3 text-xs text-zinc-500">
          <Dot color={t.company.color} />
          <Link to={`/spaces/${t.company.id}`} onClick={onClose} className="hover:underline">{t.company.name}</Link>›
          <Link to={`/projects/${t.project.id}`} onClick={onClose} className="hover:underline">{t.project.name}</Link>›
          <Link to={`/projects/${t.project.id}/boards/${t.board.id}`} onClick={onClose} className="hover:underline">{t.board.name}</Link>›
          <span>{t.column.name}</span>
          {t.archivedAt && <span className="rounded bg-amber-100 px-2 py-0.5 text-amber-800">arquivado</span>}
          <span className={cx('ml-auto transition', saved ? 'opacity-100' : 'opacity-0')}>Salvo ✓</span>
          <button data-testid="task-modal-close" className="rounded p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800" onClick={close} aria-label="Fechar"><X size={16} /></button>
        </div>
        <div className="px-5 pt-4">
          <input
            data-testid="task-title"
            className="w-full bg-transparent text-xl font-semibold outline-none"
            value={title}
            onChange={(e) => { setTitle(e.target.value); queue({ title: e.target.value }) }}
            onBlur={flush}
          />
        </div>
        <div className="grid grid-cols-1 gap-6 p-5 md:grid-cols-[1fr_260px]">
          <div className="min-w-0 space-y-6">
            <Section
              title="Descrição"
              actions={<Button size="sm" variant="ghost" data-testid="desc-toggle" onClick={() => { if (!preview) flush(); setPreview((p) => !p) }}>{preview ? 'Editar' : 'Visualizar'}</Button>}
            >
              {preview ? (
                <div className="prose-sm min-h-10 cursor-text rounded-md p-1 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800/40 [&_a]:text-indigo-600 [&_a]:underline [&_li]:ml-4 [&_ol]:list-decimal [&_ul]:list-disc [&_h1]:text-lg [&_h1]:font-bold [&_h2]:font-semibold [&_code]:rounded [&_code]:bg-zinc-100 [&_code]:px-1 dark:[&_code]:bg-zinc-800" onClick={() => setPreview(false)}>
                  {desc ? (
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={{
                        a: ({ href, children }) => (
                          <a
                            href={href}
                            onClick={(e) => {
                              e.preventDefault()
                              e.stopPropagation()
                              if (href) api('system.openExternal', { url: href }).catch((err) => toast.error(err.message))
                            }}
                          >
                            {children}
                          </a>
                        )
                      }}
                    >
                      {desc}
                    </ReactMarkdown>
                  ) : <span className="text-zinc-400">Clique para adicionar uma descrição (Markdown).</span>}
                </div>
              ) : (
                <Textarea data-testid="task-description" rows={8} autoFocus value={desc} onChange={(e) => { setDesc(e.target.value); queue({ description: e.target.value }) }} onBlur={flush} placeholder="Descrição detalhada (suporta Markdown)" />
              )}
            </Section>
            <ChecklistSection taskId={taskId} checklists={t.checklists} />
            <AttachmentsSection taskId={taskId} attachments={t.attachments} />
            <ActivitySection taskId={taskId} comments={t.comments} />
          </div>
          <aside className="space-y-3 rounded-[5px] bg-zinc-50 p-3 dark:bg-zinc-800/40">
            <Field label="Status">
              <Select data-testid="task-status" className="w-full" value={t.status} onChange={(e) => call('tasks.setStatus', { id: taskId, status: e.target.value as ColumnCategory })}>
                {CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
              </Select>
            </Field>
            <Field label="Prioridade">
              <Select data-testid="task-priority" className="w-full" value={t.priority} onChange={(e) => update({ priority: e.target.value as Priority })}>
                {PRIORITIES.map((p) => <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>)}
              </Select>
            </Field>
            <Field label="Início">
              <DateTimeField testId="task-start" value={t.startAt} onChange={(v) => update({ startAt: v })} />
            </Field>
            <Field label={t.isOverdue ? 'Vencimento (atrasada!)' : 'Vencimento'}>
              <DateTimeField testId="task-due" value={t.dueAt} onChange={(v) => update({ dueAt: v })} />
            </Field>
            <Field label="Etiquetas">
              <div className="space-y-1">
                <div className="flex flex-wrap gap-1">
                  {t.labels.map((l) => <span key={l.id} className="rounded px-1.5 text-xs text-white" style={{ background: l.color }}>{l.name}</span>)}
                </div>
                <LabelPicker taskId={taskId} selected={t.labels.map((l) => l.id)} />
              </div>
            </Field>
            <div className="flex flex-col gap-1.5 text-xs font-medium text-zinc-500 dark:text-zinc-400">
              Cor do cartão
              <ColorChoice value={t.color} testId="task-color" onChange={(c) => update({ color: c })} />
            </div>
            <Field label="Projeto">
              <div className="space-y-1">
                <div className="text-sm">{t.project.name} · {t.board.name}</div>
                <Button size="sm" data-testid="task-move" onClick={() => setMoving(true)}>Mover…</Button>
              </div>
            </Field>
            {t.scheduled.length > 0 && (
              <div className="space-y-1 text-xs" data-testid="task-scheduled">
                <div className="font-medium text-zinc-500">Programada no Meu Dia</div>
                {t.scheduled.map((s) => (
                  <Link key={`${s.date}${s.startTime}`} to={`/day?date=${s.date}`} onClick={onClose} className="block text-indigo-600 hover:underline">
                    {formatDate(s.date)} · {s.startTime}–{s.endTime}
                  </Link>
                ))}
              </div>
            )}
            <div className="space-y-0.5 text-xs text-zinc-500">
              <div>Criado em {formatDate(t.createdAt)}</div>
              {t.completedAt && <div>Concluído em {formatDate(t.completedAt)}</div>}
              <div>{t.company.isPersonal ? 'Tarefa pessoal' : 'Tarefa profissional'}</div>
            </div>
            <div className="space-y-1 border-t border-zinc-200 pt-3 dark:border-zinc-800">
              <Button className="w-full justify-start" data-testid="task-duplicate" onClick={async () => { const c = await call('tasks.duplicate', { id: taskId }); toast.success(`Cópia criada: ${c.title}`) }}><Copy size={14} /> Duplicar</Button>
              {t.archivedAt ? (
                <Button className="w-full justify-start" onClick={() => call('tasks.restore', { id: taskId })}><Archive size={14} /> Restaurar</Button>
              ) : (
                <Button className="w-full justify-start" data-testid="task-archive" onClick={() => call('tasks.archive', { id: taskId })}><Archive size={14} /> Arquivar</Button>
              )}
              <Button
                className="w-full justify-start !text-red-600 hover:!bg-red-50 dark:hover:!bg-red-950/40"
                data-testid="task-delete"
                onClick={async () => {
                  if (await confirm({ title: 'Excluir cartão permanentemente?', description: `"${t.title}" e todos os seus comentários, checklists e anexos serão apagados.`, danger: true, confirmLabel: 'Excluir' })) {
                    await call('tasks.delete', { id: taskId })
                    onClose()
                  }
                }}
              >
                <Trash2 size={14} /> Excluir
              </Button>
            </div>
          </aside>
        </div>
      </div>
      {moving && <MoveTaskDialog task={t} onClose={() => setMoving(false)} />}
    </div>
  )
}
