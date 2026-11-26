import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { MoreHorizontal, Plus } from 'lucide-react'
import { PROJECT_STATUSES, PROJECT_STATUS_LABELS } from '@shared/constants'
import type { ProjectStatus } from '@shared/types'
import { Button, Dot, Input, Menu, PageHeader, Select, Tabs, Textarea, useConfirm, usePrompt } from '../../components/ui'
import { useApiQuery, useCall } from '../../lib/queries'
import { formatDate, cx } from '../../lib/format'
import { useDialogs } from '../companies/dialogs'
import { BoardView } from '../board/BoardView'
import { ProjectFiles } from '../files/ProjectFiles'

export default function ProjectPage() {
  const params = useParams()
  const projectId = Number(params.projectId)
  const boardParam = params.boardId ? Number(params.boardId) : null
  const nav = useNavigate()
  const [tab, setTab] = useState<'boards' | 'files' | 'about'>('boards')
  const [showArchivedBoards, setShowArchivedBoards] = useState(false)
  const { data: project, error } = useApiQuery('projects.get', { id: projectId })
  const { data: allBoards } = useApiQuery('boards.list', { projectId, includeArchived: true })
  const call = useCall()
  const d = useDialogs()
  const prompt = usePrompt()
  const confirm = useConfirm()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  useEffect(() => {
    if (project) {
      setName(project.name)
      setDescription(project.description)
    }
  }, [project])

  if (error) return <PageHeader title="Projeto não encontrado" />
  if (!project) return <PageHeader title="Projeto" />

  const boards = (allBoards ?? []).filter((b) => showArchivedBoards || !b.archivedAt)
  const activeBoard = boards.find((b) => b.id === boardParam) ?? boards.find((b) => !b.archivedAt) ?? null
  const pct = project.taskCounts.total ? Math.round((project.taskCounts.done / project.taskCounts.total) * 100) : 0

  const newBoard = async () => {
    const n = await prompt({ title: 'Novo quadro', confirmLabel: 'Criar' })
    if (!n) return
    const b = await call('boards.create', { projectId, name: n })
    nav(`/projects/${projectId}/boards/${b.id}`)
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader
        title={
          <>
            <Dot color={project.color} size={12} />
            <input
              data-testid="project-title"
              className="min-w-0 bg-transparent font-semibold outline-none focus:underline"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => name.trim() && name !== project.name && call('projects.update', { id: projectId, name })}
              onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            />
            {project.archivedAt && <span className="rounded bg-zinc-200 px-2 py-0.5 text-xs dark:bg-zinc-800">arquivado</span>}
          </>
        }
      >
        <Link to={`/spaces/${project.companyId}`} className="flex items-center gap-1 text-sm text-zinc-500 hover:underline">
          <Dot color={project.company.color} /> {project.company.name}
        </Link>
        <Select value={project.status} onChange={(e) => call('projects.update', { id: projectId, status: e.target.value as ProjectStatus })}>
          {PROJECT_STATUSES.map((s) => <option key={s} value={s}>{PROJECT_STATUS_LABELS[s]}</option>)}
        </Select>
        <div className="flex items-center gap-2 text-xs text-zinc-500" title={`${project.taskCounts.done}/${project.taskCounts.total} concluídas`}>
          <div className="h-1.5 w-24 overflow-hidden rounded bg-zinc-200 dark:bg-zinc-800">
            <div className="h-full bg-emerald-500" style={{ width: `${pct}%` }} />
          </div>
          {pct}%
        </div>
        <Menu
          trigger={<Button variant="ghost" data-testid="project-menu"><MoreHorizontal size={16} /></Button>}
          items={[
            { label: 'Editar projeto', onClick: () => d.openProjectForm({ companyId: project.companyId, folderId: project.folderId, project }) },
            project.archivedAt
              ? { label: 'Restaurar projeto', onClick: () => call('projects.restore', { id: projectId }) }
              : { label: 'Arquivar projeto', testId: 'project-archive', onClick: () => d.archiveProject(project) },
            'separator',
            { label: 'Excluir projeto', danger: true, onClick: () => d.deleteProject(project) }
          ]}
        />
      </PageHeader>
      <div className="px-6">
        <Tabs value={tab} onChange={setTab} tabs={[{ value: 'boards', label: 'Quadros' }, { value: 'files', label: 'Arquivos' }, { value: 'about', label: 'Sobre' }]} />
      </div>

      {tab === 'boards' && (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex flex-wrap items-center gap-1 px-6 py-3">
            {boards.map((b) => (
              <div key={b.id} className={cx('group flex items-center rounded-md text-sm', b.id === activeBoard?.id ? 'surface font-semibold' : 'hover:bg-white/70 dark:hover:bg-zinc-900')}>
                <button data-testid={`board-tab-${b.id}`} className={cx('px-3 py-1', b.archivedAt && 'italic text-zinc-400')} onClick={() => nav(`/projects/${projectId}/boards/${b.id}`)}>
                  {b.name}
                </button>
                <Menu
                  trigger={<button className="invisible pr-1 group-hover:visible"><MoreHorizontal size={14} /></button>}
                  items={[
                    { label: 'Renomear', onClick: async () => { const n = await prompt({ title: 'Renomear quadro', initial: b.name }); if (n) call('boards.update', { id: b.id, name: n }) } },
                    { label: 'Mover para a esquerda', onClick: () => { const i = boards.indexOf(b); if (i > 0) call('boards.reorder', { id: b.id, beforeId: boards[i - 2]?.id ?? null, afterId: boards[i - 1].id }) } },
                    { label: 'Mover para a direita', onClick: () => { const i = boards.indexOf(b); if (i < boards.length - 1) call('boards.reorder', { id: b.id, beforeId: boards[i + 1].id, afterId: boards[i + 2]?.id ?? null }) } },
                    b.archivedAt
                      ? { label: 'Restaurar', onClick: () => call('boards.restore', { id: b.id }) }
                      : { label: 'Arquivar', onClick: () => call('boards.archive', { id: b.id }) },
                    'separator',
                    {
                      label: 'Excluir quadro',
                      danger: true,
                      onClick: async () => {
                        if (await confirm({ title: `Excluir o quadro "${b.name}"?`, description: 'Todas as colunas e cartões deste quadro serão apagados permanentemente.', danger: true, requireText: b.name, confirmLabel: 'Excluir' })) {
                          await call('boards.delete', { id: b.id })
                          nav(`/projects/${projectId}`)
                        }
                      }
                    }
                  ]}
                />
              </div>
            ))}
            <Button size="sm" variant="ghost" data-testid="new-board" onClick={newBoard}><Plus size={14} /> Quadro</Button>
            <label className="ml-auto flex items-center gap-1 text-xs text-zinc-500">
              <input type="checkbox" checked={showArchivedBoards} onChange={(e) => setShowArchivedBoards(e.target.checked)} /> quadros arquivados
            </label>
          </div>
          {activeBoard ? <BoardView boardId={activeBoard.id} /> : <div className="p-6 text-sm text-zinc-500">Nenhum quadro. Crie um para começar.</div>}
        </div>
      )}

      {tab === 'files' && <ProjectFiles projectId={projectId} />}

      {tab === 'about' && (
        <div className="max-w-2xl space-y-4 overflow-y-auto p-6 text-sm">
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-xs text-zinc-500">Início
              <Input type="date" value={project.startDate ?? ''} onChange={(e) => call('projects.update', { id: projectId, startDate: e.target.value || null })} />
            </label>
            <label className="flex flex-col gap-1 text-xs text-zinc-500">Prazo final
              <Input type="date" value={project.dueDate ?? ''} onChange={(e) => call('projects.update', { id: projectId, dueDate: e.target.value || null })} />
            </label>
          </div>
          <label className="flex flex-col gap-1 text-xs text-zinc-500">Descrição
            <Textarea rows={8} value={description} onChange={(e) => setDescription(e.target.value)} onBlur={() => description !== project.description && call('projects.update', { id: projectId, description })} />
          </label>
          <div className="text-xs text-zinc-500">Criado em {formatDate(project.createdAt)} · {project.taskCounts.total} tarefa(s), {project.taskCounts.done} concluída(s), {project.taskCounts.overdue} atrasada(s)</div>
        </div>
      )}
    </div>
  )
}
