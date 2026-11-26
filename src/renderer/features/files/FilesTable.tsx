import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ExternalLink, FolderOpen, Trash2 } from 'lucide-react'
import type { ApiMethods } from '@shared/api'
import { Dot, EmptyState, Input, Select, useConfirm } from '../../components/ui'
import { useApiQuery, useCall } from '../../lib/queries'
import { formatBytes, formatDate } from '../../lib/format'
import { allProjects } from '../week/TaskFilters'

type Kind = 'image' | 'pdf' | 'document' | 'other'
type Item = ApiMethods['attachments.list']['output'][number]
const KIND_LABEL: Record<Kind, string> = { image: 'Imagem', pdf: 'PDF', document: 'Documento', other: 'Outro' }

function Thumb({ a }: { a: Item }) {
  const { data } = useApiQuery('attachments.thumbnail', { id: a.id }, { enabled: a.kind === 'image' })
  if (data) return <img src={data} alt="" className="h-8 w-8 rounded object-cover" />
  return <div className="flex h-8 w-8 items-center justify-center rounded bg-zinc-100 text-[9px] font-semibold uppercase text-zinc-500 dark:bg-zinc-800">{a.originalName.split('.').pop()?.slice(0, 4)}</div>
}

export function FilesTable({ fixedProjectId }: { fixedProjectId?: number }) {
  const [companyId, setCompanyId] = useState<number | ''>('')
  const [projectId, setProjectId] = useState<number | ''>('')
  const [kind, setKind] = useState<Kind | ''>('')
  const [text, setText] = useState('')
  const { data: tree } = useApiQuery('spaces.tree', {})
  const { data } = useApiQuery('attachments.list', {
    companyId: companyId || undefined,
    projectId: fixedProjectId ?? (projectId || undefined),
    kind: kind || undefined,
    text: text || undefined
  })
  const call = useCall()
  const confirm = useConfirm()
  const nav = useNavigate()
  const projects = allProjects(tree).filter((p) => !companyId || p.companyId === companyId)
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--line)] pb-3">
        <Input className="w-56" placeholder="Buscar por nome…" value={text} onChange={(e) => setText(e.target.value)} data-testid="files-search" />
        {!fixedProjectId && (
          <>
            <Select data-testid="files-company" value={companyId} onChange={(e) => { setCompanyId(e.target.value ? Number(e.target.value) : ''); setProjectId('') }}>
              <option value="">Todos os espaços</option>
              {tree?.map((s) => <option key={s.company.id} value={s.company.id}>{s.company.name}</option>)}
            </Select>
            <Select value={projectId} onChange={(e) => setProjectId(e.target.value ? Number(e.target.value) : '')}>
              <option value="">Todos os projetos</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          </>
        )}
        <Select value={kind} onChange={(e) => setKind(e.target.value as Kind | '')}>
          <option value="">Todos os tipos</option>
          {(Object.keys(KIND_LABEL) as Kind[]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
        </Select>
      </div>
      {!data?.length ? (
        <EmptyState text="Nenhum arquivo." />
      ) : (
        <table className="w-full text-sm" data-testid="files-table">
          <thead>
            <tr className="text-left text-xs text-zinc-500">
              <th className="pb-2 font-medium">Nome</th>
              <th className="pb-2 font-medium">Tipo</th>
              <th className="pb-2 text-right font-medium">Tamanho</th>
              <th className="pb-2 font-medium">Data</th>
              <th className="pb-2 font-medium">Origem</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {data.map((a) => (
              <tr key={a.id} data-testid={`file-row-${a.id}`} className="group border-t border-zinc-100 dark:border-zinc-800">
                <td className="py-1.5">
                  <button className="flex items-center gap-2 text-left hover:underline" onClick={() => call('attachments.open', { id: a.id })}>
                    <Thumb a={a} /> <span className="max-w-80 truncate">{a.originalName}</span>
                  </button>
                </td>
                <td className="text-xs text-zinc-500">{KIND_LABEL[a.kind]}</td>
                <td className="text-right text-xs tabular-nums text-zinc-500">{formatBytes(a.sizeBytes)}</td>
                <td className="text-xs text-zinc-500">{formatDate(a.createdAt, false)}</td>
                <td className="text-xs">
                  <button
                    className="flex items-center gap-1 hover:underline"
                    onClick={() => nav(a.taskId ? `/projects/${a.projectId}?task=${a.taskId}` : `/projects/${a.projectId}`)}
                  >
                    <Dot color={a.companyColor} size={8} />
                    {a.taskTitle ? `${a.taskTitle} › ` : ''}{a.projectName} › {a.companyName}
                  </button>
                </td>
                <td className="w-20">
                  <div className="invisible flex justify-end gap-2 group-hover:visible">
                    <button title="Abrir" onClick={() => call('attachments.open', { id: a.id })}><ExternalLink size={14} /></button>
                    <button title="Mostrar na pasta" onClick={() => call('attachments.reveal', { id: a.id })}><FolderOpen size={14} /></button>
                    <button
                      title="Excluir"
                      className="hover:text-red-600"
                      onClick={async () => (await confirm({ title: 'Excluir arquivo?', description: `"${a.originalName}" será removido.`, danger: true, confirmLabel: 'Excluir' })) && call('attachments.delete', { id: a.id })}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
