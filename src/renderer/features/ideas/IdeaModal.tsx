import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { ExternalLink, Paperclip, Trash2 } from 'lucide-react'
import type { IdeaStatus, Priority } from '@shared/types'
import { IDEA_STATUSES, IDEA_STATUS_LABELS, PRIORITIES, PRIORITY_LABELS, SPACE_COLORS } from '@shared/constants'
import { Button, Field, Input, Modal, Select, Textarea, useConfirm } from '../../components/ui'
import { useApiQuery, useCall } from '../../lib/queries'
import { api } from '../../lib/api'
import { formatBytes, formatDate } from '../../lib/format'
import { useToast } from '../../components/toast'
import { useAttachmentActions } from '../../lib/attachments'
import { allProjects } from '../week/TaskFilters'

export function IdeaModal({ id, onClose }: { id: number; onClose: () => void }) {
  const { data: idea, error } = useApiQuery('ideas.get', { id })
  const { data: tree } = useApiQuery('spaces.tree', {})
  const { data: labels } = useApiQuery('labels.list', {})
  const { data: categories } = useApiQuery('ideas.categories', {})
  const call = useCall()
  const confirm = useConfirm()
  const toast = useToast()
  const files = useAttachmentActions()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('')
  const [preview, setPreview] = useState(true)
  const [newLabel, setNewLabel] = useState('')
  const [convert, setConvert] = useState<'task' | 'project' | null>(null)
  const [target, setTarget] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const loaded = useRef(false)
  useEffect(() => {
    if (idea && !loaded.current) {
      loaded.current = true
      setTitle(idea.title)
      setDescription(idea.description)
      setCategory(idea.category)
      setPreview(!!idea.description)
    }
  }, [idea])

  if (error) return <Modal open onClose={onClose} title="Ideia não encontrada"><div className="text-sm">Esta ideia não existe mais.</div></Modal>
  if (!idea) return null

  const save = (patch: Parameters<typeof api<'ideas.update'>>[1] extends infer P ? Omit<P & object, 'id'> : never) => call('ideas.update', { id, ...patch })
  const selectedLabels = idea.labels.map((l) => l.id)
  const projects = allProjects(tree).filter((p) => !idea.companyId || p.companyId === idea.companyId)
  const addFiles = (list: File[]) => files.add({ ideaId: id }, list)
  const close = async () => {
    const el = document.activeElement as HTMLElement | null
    el?.blur()
    await new Promise((r) => setTimeout(r, 0))
    onClose()
  }

  return (
    <Modal open onClose={close} title={<span className="section-title">Ideia · criada em {formatDate(idea.createdAt)}</span>} width="max-w-4xl" testId="idea-modal">
      <div className="space-y-4">
        <input
          data-testid="idea-title"
          className="w-full bg-transparent text-xl font-semibold outline-none"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => title.trim() && title !== idea.title && save({ title })}
        />
        {(idea.convertedTaskId || idea.convertedProjectId) && (
          <div className="flex flex-wrap gap-3 rounded-[5px] bg-emerald-500/10 px-3 py-2 text-sm text-emerald-800 dark:text-emerald-300">
            {idea.convertedTaskId && <Link data-testid="idea-open-task" to={`/all?task=${idea.convertedTaskId}`} onClick={onClose} className="font-medium hover:underline">→ Abrir tarefa criada</Link>}
            {idea.convertedProjectId && <Link to={`/projects/${idea.convertedProjectId}`} onClick={onClose} className="font-medium hover:underline">→ Abrir projeto criado</Link>}
          </div>
        )}
        <div className="grid grid-cols-1 gap-5 md:grid-cols-[1fr_250px]">
          <div className="min-w-0 space-y-4">
            <section className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="section-title">Descrição</h3>
                <Button size="sm" variant="ghost" onClick={() => setPreview((p) => !p)}>{preview ? 'Editar' : 'Visualizar'}</Button>
              </div>
              {preview ? (
                <div className="min-h-10 cursor-text rounded-md p-1 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800/40 [&_li]:ml-4 [&_ul]:list-disc" onClick={() => setPreview(false)}>
                  {description ? <ReactMarkdown remarkPlugins={[remarkGfm]}>{description}</ReactMarkdown> : <span className="text-zinc-400">Clique para descrever a ideia.</span>}
                </div>
              ) : (
                <Textarea data-testid="idea-description" rows={6} autoFocus value={description} onChange={(e) => setDescription(e.target.value)} onBlur={() => description !== idea.description && save({ description })} />
              )}
            </section>
            <section className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="section-title">Anexos</h3>
                <div className="flex gap-1">
                  <Button size="sm" onClick={() => fileRef.current?.click()}><Paperclip size={12} /> Adicionar</Button>
                  <input ref={fileRef} type="file" multiple hidden data-testid="idea-attach-input" onChange={(e) => { addFiles(Array.from(e.target.files ?? [])); e.target.value = '' }} />
                </div>
              </div>
              {!idea.attachments.length && <div className="rounded-md border border-dashed border-[var(--line-strong)] p-3 text-center text-xs text-zinc-500">Nenhum anexo.</div>}
              {idea.attachments.map((a) => (
                <div key={a.id} className="group flex items-center gap-2 rounded p-1 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                  <button className="min-w-0 flex-1 truncate text-left" onClick={() => files.open(a.id)}>{a.originalName} <span className="text-xs text-zinc-500">· {formatBytes(a.sizeBytes)}</span></button>
                  <div className="invisible flex gap-1 group-hover:visible">
                    <button title="Abrir" onClick={() => files.open(a.id)}><ExternalLink size={14} /></button>
                    <button title="Remover" className="hover:text-red-600" onClick={() => call('attachments.delete', { id: a.id })}><Trash2 size={14} /></button>
                  </div>
                </div>
              ))}
            </section>
          </div>
          <aside className="space-y-3 rounded-[5px] bg-zinc-50 p-3 dark:bg-zinc-800/40">
            <Field label="Status">
              <Select data-testid="idea-status" className="w-full" value={idea.status} onChange={(e) => save({ status: e.target.value as IdeaStatus })}>
                {IDEA_STATUSES.map((s) => <option key={s} value={s}>{IDEA_STATUS_LABELS[s]}</option>)}
              </Select>
            </Field>
            <Field label="Prioridade">
              <Select className="w-full" value={idea.priority} onChange={(e) => save({ priority: e.target.value as Priority })}>
                {PRIORITIES.map((p) => <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>)}
              </Select>
            </Field>
            <Field label="Categoria">
              <Input data-testid="idea-category" list="idea-categories" value={category} onChange={(e) => setCategory(e.target.value)} onBlur={() => category !== idea.category && save({ category })} placeholder="Ex.: Negócio, Pessoal…" />
              <datalist id="idea-categories">{categories?.map((c) => <option key={c} value={c} />)}</datalist>
            </Field>
            <Field label="Empresa (opcional)">
              <Select className="w-full" value={idea.companyId ?? ''} onChange={(e) => save({ companyId: e.target.value ? Number(e.target.value) : null, projectId: null })}>
                <option value="">Nenhuma</option>
                {tree?.map((s) => <option key={s.company.id} value={s.company.id}>{s.company.name}</option>)}
              </Select>
            </Field>
            <Field label="Projeto (opcional)">
              <Select className="w-full" value={idea.projectId ?? ''} onChange={(e) => save({ projectId: e.target.value ? Number(e.target.value) : null })}>
                <option value="">Nenhum</option>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </Select>
            </Field>
            <div className="flex flex-col gap-1.5 text-xs font-medium text-zinc-500">
              Etiquetas
              <div className="flex flex-wrap gap-1">
                {labels?.map((l) => {
                  const on = selectedLabels.includes(l.id)
                  return (
                    <button
                      key={l.id}
                      type="button"
                      data-testid={`idea-label-${l.id}`}
                      onClick={() => call('ideas.setLabels', { id, labelIds: on ? selectedLabels.filter((x) => x !== l.id) : [...selectedLabels, l.id] })}
                      className="rounded-[3px] px-1.5 py-0.5 text-[11px] font-semibold transition"
                      style={on ? { background: l.color, color: '#fff' } : { boxShadow: `inset 0 0 0 1px ${l.color}`, color: l.color }}
                    >
                      {l.name}
                    </button>
                  )
                })}
              </div>
              <form
                className="flex gap-1"
                onSubmit={async (e) => {
                  e.preventDefault()
                  if (!newLabel.trim()) return
                  const l = await call('labels.create', { name: newLabel, color: SPACE_COLORS[(labels?.length ?? 0) % SPACE_COLORS.length] })
                  await call('ideas.setLabels', { id, labelIds: [...selectedLabels, l.id] })
                  setNewLabel('')
                }}
              >
                <Input data-testid="idea-new-label" placeholder="Nova etiqueta" value={newLabel} onChange={(e) => setNewLabel(e.target.value)} />
                <Button size="sm" type="submit">+</Button>
              </form>
            </div>
            <div className="space-y-1 border-t border-[var(--line)] pt-3">
              <Button className="w-full justify-start" data-testid="idea-to-task" disabled={!!idea.convertedTaskId} onClick={() => { setTarget(idea.projectId ? String(idea.projectId) : ''); setConvert('task') }}>Transformar em tarefa</Button>
              <Button className="w-full justify-start" data-testid="idea-to-project" disabled={!!idea.convertedProjectId} onClick={() => { setTarget(idea.companyId ? String(idea.companyId) : '1'); setConvert('project') }}>Transformar em projeto</Button>
              <Button
                className="w-full justify-start !text-red-600"
                onClick={async () => {
                  if (await confirm({ title: 'Excluir esta ideia?', description: `"${idea.title}" e seus anexos serão apagados.`, danger: true, confirmLabel: 'Excluir' })) {
                    await call('ideas.delete', { id })
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
      {convert && (
        <Modal open onClose={() => setConvert(null)} title={convert === 'task' ? 'Transformar em tarefa' : 'Transformar em projeto'} testId="idea-convert">
          <div className="space-y-3 text-sm">
            <p className="text-zinc-600 dark:text-zinc-400">
              {convert === 'task'
                ? 'Uma tarefa será criada com o título, a descrição, a prioridade, as etiquetas e os anexos desta ideia. A ideia continua guardada.'
                : 'Um projeto será criado com o nome e a descrição desta ideia. A ideia continua guardada.'}
            </p>
            {convert === 'task' ? (
              <Field label="Projeto de destino">
                <Select data-testid="idea-convert-target" className="w-full" value={target} onChange={(e) => setTarget(e.target.value)}>
                  <option value="">Escolha…</option>
                  {allProjects(tree).map((p) => <option key={p.id} value={p.id}>{tree?.find((s) => s.company.id === p.companyId)?.company.name} › {p.name}</option>)}
                </Select>
              </Field>
            ) : (
              <Field label="Espaço">
                <Select data-testid="idea-convert-target" className="w-full" value={target} onChange={(e) => setTarget(e.target.value)}>
                  {tree?.map((s) => <option key={s.company.id} value={s.company.id}>{s.company.name}</option>)}
                </Select>
              </Field>
            )}
            <div className="flex justify-end gap-2">
              <Button onClick={() => setConvert(null)}>Cancelar</Button>
              <Button
                variant="primary"
                data-testid="idea-convert-ok"
                disabled={!target}
                onClick={async () => {
                  if (convert === 'task') {
                    await call('ideas.toTask', { id, projectId: Number(target) })
                    toast.success('Tarefa criada a partir da ideia')
                  } else {
                    await call('ideas.toProject', { id, companyId: Number(target), folderId: null })
                    toast.success('Projeto criado a partir da ideia')
                  }
                  setConvert(null)
                }}
              >
                Criar
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </Modal>
  )
}
