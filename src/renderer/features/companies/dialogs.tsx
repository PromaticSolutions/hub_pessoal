import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Company, Project, ProjectStatus } from '@shared/types'
import { PROJECT_STATUSES, PROJECT_STATUS_LABELS, SPACE_COLORS } from '@shared/constants'
import { Button, ColorPicker, Field, Input, Modal, Select, Textarea, useConfirm, usePrompt } from '../../components/ui'
import { api } from '../../lib/api'
import { useApiQuery, useCall } from '../../lib/queries'
import { formatDate } from '../../lib/format'

type ProjectFormState = { companyId: number; folderId: number | null; project?: Project }

type Dialogs = {
  openCompanyForm(c?: Company): void
  openProjectForm(s: ProjectFormState): void
  newFolder(companyId: number, parentId: number | null): Promise<void>
  renameFolder(id: number, current: string): Promise<void>
  archiveCompany(c: Company): Promise<void>
  deleteCompany(c: Company): Promise<void>
  archiveProject(p: Project): Promise<void>
  deleteProject(p: Project): Promise<void>
  archiveFolder(id: number): Promise<void>
  deleteFolder(id: number, name: string): Promise<void>
}

const Ctx = createContext<Dialogs | null>(null)
export const useDialogs = () => useContext(Ctx)!

export function DialogsProvider({ children }: { children: ReactNode }) {
  const [companyForm, setCompanyForm] = useState<{ open: boolean; company?: Company }>({ open: false })
  const [projectForm, setProjectForm] = useState<ProjectFormState | null>(null)
  const call = useCall()
  const confirm = useConfirm()
  const prompt = usePrompt()
  const nav = useNavigate()

  const value: Dialogs = {
    openCompanyForm: (company) => setCompanyForm({ open: true, company }),
    openProjectForm: (s) => setProjectForm(s),
    async newFolder(companyId, parentId) {
      const name = await prompt({ title: 'Nova pasta', confirmLabel: 'Criar' })
      if (name) await call('folders.create', { companyId, parentId, name })
    },
    async renameFolder(id, current) {
      const name = await prompt({ title: 'Renomear pasta', initial: current })
      if (name) await call('folders.update', { id, name })
    },
    async archiveCompany(c) {
      if (await confirm({ title: `Arquivar "${c.name}"?`, description: 'A empresa sai das listas ativas, mas nada é apagado. Você pode restaurar depois.', confirmLabel: 'Arquivar' }))
        await call('companies.archive', { id: c.id })
    },
    async deleteCompany(c) {
      const impact = await api('companies.deletionImpact', { id: c.id })
      const ok = await confirm({
        title: `Excluir "${c.name}" permanentemente?`,
        description: `Serão apagados ${impact.projects} projeto(s), ${impact.tasks} tarefa(s) e ${impact.attachments} anexo(s). Esta ação não pode ser desfeita. Prefira arquivar se quiser manter o histórico.`,
        danger: true,
        confirmLabel: 'Excluir definitivamente',
        requireText: c.name
      })
      if (ok) {
        await call('companies.delete', { id: c.id })
        nav('/companies')
      }
    },
    async archiveProject(p) {
      if (await confirm({ title: `Arquivar "${p.name}"?`, description: 'O projeto e suas tarefas saem das visões ativas. Nada é apagado.', confirmLabel: 'Arquivar' }))
        await call('projects.archive', { id: p.id })
    },
    async deleteProject(p) {
      const impact = await api('projects.deletionImpact', { id: p.id })
      const ok = await confirm({
        title: `Excluir "${p.name}" permanentemente?`,
        description: `Serão apagados ${impact.boards} quadro(s), ${impact.tasks} tarefa(s) e ${impact.attachments} anexo(s). Esta ação não pode ser desfeita.`,
        danger: true,
        confirmLabel: 'Excluir definitivamente',
        requireText: p.name
      })
      if (ok) {
        await call('projects.delete', { id: p.id })
        nav(`/spaces/${p.companyId}`)
      }
    },
    async archiveFolder(id) {
      await call('folders.archive', { id })
    },
    async deleteFolder(id, name) {
      if (await confirm({ title: `Excluir a pasta "${name}"?`, description: 'Os projetos e subpastas dentro dela sobem um nível. Nada além da pasta é apagado.', confirmLabel: 'Excluir pasta', danger: true }))
        await call('folders.delete', { id })
    }
  }

  return (
    <Ctx.Provider value={value}>
      {children}
      <CompanyForm state={companyForm} onClose={() => setCompanyForm({ open: false })} />
      {projectForm && <ProjectForm state={projectForm} onClose={() => setProjectForm(null)} />}
    </Ctx.Provider>
  )
}

function CompanyForm({ state, onClose }: { state: { open: boolean; company?: Company }; onClose: () => void }) {
  const c = state.company
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [color, setColor] = useState(SPACE_COLORS[1])
  const [logo, setLogo] = useState<string | null | undefined>(undefined)
  const call = useCall()
  const nav = useNavigate()
  useEffect(() => {
    if (!state.open) return
    setName(c?.name ?? '')
    setDescription(c?.description ?? '')
    setColor(c?.color ?? SPACE_COLORS[Math.floor(Math.random() * SPACE_COLORS.length)])
    setLogo(undefined)
  }, [state.open, c])
  const pickLogo = async () => {
    const [p] = await api('system.pickFiles', { multiple: false, images: true })
    if (p) setLogo(p)
  }
  const save = async () => {
    const saved = c
      ? await call('companies.update', { id: c.id, name, description, color })
      : await call('companies.create', { name, description, color })
    if (logo !== undefined) await call('companies.setLogo', { id: saved.id, sourcePath: logo })
    onClose()
    if (!c) nav(`/spaces/${saved.id}`)
  }
  return (
    <Modal open={state.open} onClose={onClose} title={c ? 'Editar empresa' : 'Nova empresa'} testId="company-form">
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); if (name.trim()) save() }}>
        <Field label="Nome *">
          <Input data-testid="company-name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </Field>
        <Field label="Descrição">
          <Textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <Field label="Cor">
          <ColorPicker value={color} onChange={setColor} />
        </Field>
        <Field label="Logotipo">
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={pickLogo}>Escolher imagem</Button>
            {(c?.logoPath || logo) && logo !== null && <Button size="sm" variant="ghost" onClick={() => setLogo(null)}>Remover</Button>}
            <span className="truncate text-xs text-zinc-500">{logo ? logo.split('/').pop() : logo === null ? 'sem logotipo' : c?.logoPath ? 'logotipo atual' : ''}</span>
          </div>
        </Field>
        {c && <div className="text-xs text-zinc-500">Cadastrada em {formatDate(c.createdAt)}</div>}
        <div className="flex justify-end gap-2 pt-2">
          <Button onClick={onClose}>Cancelar</Button>
          <Button data-testid="company-save" type="submit" variant="primary" disabled={!name.trim()}>Salvar</Button>
        </div>
      </form>
    </Modal>
  )
}

function ProjectForm({ state, onClose }: { state: ProjectFormState; onClose: () => void }) {
  const p = state.project
  const { data: tree } = useApiQuery('spaces.tree', {})
  const [companyId, setCompanyId] = useState(p?.companyId ?? state.companyId)
  const [folderId, setFolderId] = useState<number | null>(p?.folderId ?? state.folderId)
  const [name, setName] = useState(p?.name ?? '')
  const [description, setDescription] = useState(p?.description ?? '')
  const [color, setColor] = useState(p?.color ?? SPACE_COLORS[Math.floor(Math.random() * SPACE_COLORS.length)])
  const [startDate, setStartDate] = useState(p?.startDate ?? '')
  const [dueDate, setDueDate] = useState(p?.dueDate ?? '')
  const [status, setStatus] = useState<ProjectStatus>(p?.status ?? 'active')
  const call = useCall()
  const nav = useNavigate()
  const space = tree?.find((s) => s.company.id === companyId)
  const folderOptions: { id: number; label: string }[] = []
  const walk = (nodes: NonNullable<typeof space>['folders'], depth: number) =>
    nodes.forEach((f) => {
      folderOptions.push({ id: f.id, label: `${'— '.repeat(depth)}${f.name}` })
      walk(f.children, depth + 1)
    })
  if (space) walk(space.folders, 0)

  const save = async () => {
    const common = { name, description, color, startDate: startDate || null, dueDate: dueDate || null, status }
    if (p) {
      await call('projects.update', { id: p.id, ...common })
      if (p.companyId !== companyId || p.folderId !== folderId)
        await call('projects.move', { id: p.id, companyId, folderId, beforeId: null, afterId: null })
      onClose()
    } else {
      const created = await call('projects.create', { companyId, folderId, ...common })
      onClose()
      nav(`/projects/${created.id}`)
    }
  }
  return (
    <Modal open onClose={onClose} title={p ? 'Editar projeto' : 'Novo projeto'} testId="project-form">
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); if (name.trim()) save() }}>
        <Field label="Nome *">
          <Input data-testid="project-name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Espaço">
            <Select className="w-full" value={companyId} onChange={(e) => { setCompanyId(Number(e.target.value)); setFolderId(null) }}>
              {tree?.map((s) => <option key={s.company.id} value={s.company.id}>{s.company.name}</option>)}
            </Select>
          </Field>
          <Field label="Pasta">
            <Select data-testid="project-folder" className="w-full" value={folderId ?? ''} onChange={(e) => setFolderId(e.target.value ? Number(e.target.value) : null)}>
              <option value="">(raiz do espaço)</option>
              {folderOptions.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
            </Select>
          </Field>
          <Field label="Início">
            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </Field>
          <Field label="Prazo final">
            <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </Field>
          <Field label="Status">
            <Select className="w-full" value={status} onChange={(e) => setStatus(e.target.value as ProjectStatus)}>
              {PROJECT_STATUSES.map((s) => <option key={s} value={s}>{PROJECT_STATUS_LABELS[s]}</option>)}
            </Select>
          </Field>
        </div>
        <Field label="Cor">
          <ColorPicker value={color} onChange={setColor} />
        </Field>
        <Field label="Descrição">
          <Textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <Button onClick={onClose}>Cancelar</Button>
          <Button data-testid="project-save" type="submit" variant="primary" disabled={!name.trim()}>Salvar</Button>
        </div>
      </form>
    </Modal>
  )
}
