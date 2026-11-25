import { useState, type DragEvent, type ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import { ChevronDown, ChevronRight, Folder as FolderIcon, MoreHorizontal, Plus } from 'lucide-react'
import type { Company, Project } from '@shared/types'
import type { ApiMethods } from '@shared/api'
import { Dot, Menu } from '../components/ui'
import { useApiQuery, useCall } from '../lib/queries'
import { api } from '../lib/api'
import { cx } from '../lib/format'
import { useDialogs } from '../features/companies/dialogs'

type Tree = ApiMethods['spaces.tree']['output']
type FolderNode = Tree[number]['folders'][number]
type DragItem = { kind: 'project' | 'folder'; id: number }

const DRAG_MIME = 'application/x-pth-tree'

function useExpanded() {
  const { data } = useApiQuery('settings.get', { key: 'sidebar.expanded' })
  const [local, setLocal] = useState<string[] | null>(null)
  const list = local ?? (Array.isArray(data) ? (data as string[]) : [])
  const toggle = (key: string) => {
    const next = list.includes(key) ? list.filter((k) => k !== key) : [...list, key]
    setLocal(next)
    api('settings.set', { key: 'sidebar.expanded', value: next }).catch(() => {})
  }
  const ensure = (key: string) => {
    if (!list.includes(key)) toggle(key)
  }
  return { isOpen: (k: string) => list.includes(k), toggle, ensure }
}

function readDrag(e: DragEvent): DragItem | null {
  try {
    return JSON.parse(e.dataTransfer.getData(DRAG_MIME)) as DragItem
  } catch {
    return null
  }
}

function Row({
  depth,
  children,
  onDrop,
  dragItem,
  testId
}: {
  depth: number
  children: ReactNode
  onDrop?: (item: DragItem) => void
  dragItem?: DragItem
  testId?: string
}) {
  const [over, setOver] = useState(false)
  return (
    <div
      data-testid={testId}
      draggable={!!dragItem}
      onDragStart={(e) => {
        if (!dragItem) return
        e.dataTransfer.setData(DRAG_MIME, JSON.stringify(dragItem))
        e.dataTransfer.effectAllowed = 'move'
        e.stopPropagation()
      }}
      onDragOver={(e) => {
        if (!onDrop || !e.dataTransfer.types.includes(DRAG_MIME)) return
        e.preventDefault()
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        setOver(false)
        const item = readDrag(e)
        if (item && onDrop) {
          e.preventDefault()
          e.stopPropagation()
          onDrop(item)
        }
      }}
      className={cx('group flex items-center gap-1 rounded-md pr-1 text-sm', over && 'bg-indigo-100 dark:bg-indigo-900/40')}
      style={{ paddingLeft: 4 + depth * 12 }}
    >
      {children}
    </div>
  )
}

export function SpaceTree() {
  const { data: tree } = useApiQuery('spaces.tree', {})
  const exp = useExpanded()
  const call = useCall()
  const d = useDialogs()

  const dropInto = (companyId: number, folderId: number | null) => async (item: DragItem) => {
    if (item.kind === 'project') await call('projects.move', { id: item.id, companyId, folderId, beforeId: null, afterId: null })
    else if (item.id !== folderId) await call('folders.move', { id: item.id, companyId, parentId: folderId, beforeId: null, afterId: null })
  }
  const dropBeforeProject = (p: Project, siblings: Project[]) => async (item: DragItem) => {
    if (item.kind !== 'project' || item.id === p.id) return dropInto(p.companyId, p.folderId)(item)
    const idx = siblings.findIndex((s) => s.id === p.id)
    const prev = siblings.slice(0, idx).filter((s) => s.id !== item.id).pop()
    await call('projects.move', { id: item.id, companyId: p.companyId, folderId: p.folderId, beforeId: prev?.id ?? null, afterId: p.id })
  }

  const projectRow = (p: Project, siblings: Project[], depth: number) => (
    <Row key={`p${p.id}`} depth={depth} dragItem={{ kind: 'project', id: p.id }} onDrop={dropBeforeProject(p, siblings)} testId={`tree-project-${p.id}`}>
      <span className="w-4" />
      <NavLink
        to={`/projects/${p.id}`}
        className={({ isActive }) => cx('flex min-w-0 flex-1 items-center gap-2 rounded px-1 py-1', isActive ? 'bg-zinc-200 font-medium dark:bg-zinc-800' : 'hover:bg-zinc-100 dark:hover:bg-zinc-800/60')}
      >
        <span className="h-2 w-2 shrink-0 rounded-sm" style={{ background: p.color }} />
        <span className="truncate">{p.name}</span>
      </NavLink>
      <Menu
        trigger={<button className="invisible rounded p-0.5 group-hover:visible hover:bg-zinc-200 dark:hover:bg-zinc-700"><MoreHorizontal size={14} /></button>}
        items={[
          { label: 'Editar', onClick: () => d.openProjectForm({ companyId: p.companyId, folderId: p.folderId, project: p }) },
          { label: 'Arquivar', onClick: () => d.archiveProject(p) },
          'separator',
          { label: 'Excluir', danger: true, onClick: () => d.deleteProject(p) }
        ]}
      />
    </Row>
  )

  const folderRow = (f: FolderNode, depth: number): ReactNode => {
    const key = `f:${f.id}`
    const open = exp.isOpen(key)
    return (
      <div key={key}>
        <Row depth={depth} dragItem={{ kind: 'folder', id: f.id }} onDrop={dropInto(f.companyId, f.id)} testId={`tree-folder-${f.id}`}>
          <button className="rounded p-0.5 hover:bg-zinc-200 dark:hover:bg-zinc-700" onClick={() => exp.toggle(key)}>
            {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
          <button className="flex min-w-0 flex-1 items-center gap-1.5 py-1 text-left" onClick={() => exp.toggle(key)}>
            <FolderIcon size={14} className="shrink-0 text-zinc-400" />
            <span className="truncate">{f.name}</span>
          </button>
          <Menu
            trigger={<button className="invisible rounded p-0.5 group-hover:visible hover:bg-zinc-200 dark:hover:bg-zinc-700"><MoreHorizontal size={14} /></button>}
            items={[
              { label: 'Novo projeto aqui', onClick: () => { exp.ensure(key); d.openProjectForm({ companyId: f.companyId, folderId: f.id }) } },
              { label: 'Nova subpasta', onClick: () => { exp.ensure(key); d.newFolder(f.companyId, f.id) } },
              { label: 'Renomear', onClick: () => d.renameFolder(f.id, f.name) },
              { label: 'Arquivar', onClick: () => d.archiveFolder(f.id) },
              'separator',
              { label: 'Excluir pasta', danger: true, onClick: () => d.deleteFolder(f.id, f.name) }
            ]}
          />
        </Row>
        {open && (
          <>
            {f.children.map((c) => folderRow(c, depth + 1))}
            {f.projects.map((p) => projectRow(p, f.projects, depth + 1))}
          </>
        )}
      </div>
    )
  }

  const spaceRow = (s: Tree[number]) => {
    const c: Company = s.company
    const key = `c:${c.id}`
    const open = exp.isOpen(key)
    return (
      <div key={key} className="mb-1">
        <Row depth={0} onDrop={dropInto(c.id, null)} testId={`tree-company-${c.id}`}>
          <button className="rounded p-0.5 hover:bg-zinc-200 dark:hover:bg-zinc-700" onClick={() => exp.toggle(key)}>
            {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
          <NavLink
            to={`/spaces/${c.id}`}
            className={({ isActive }) => cx('flex min-w-0 flex-1 items-center gap-2 rounded px-1 py-1 font-medium', isActive ? 'bg-zinc-200 dark:bg-zinc-800' : 'hover:bg-zinc-100 dark:hover:bg-zinc-800/60')}
          >
            <Dot color={c.color} />
            <span className="truncate">{c.name}</span>
          </NavLink>
          <Menu
            trigger={<button data-testid={`tree-company-menu-${c.id}`} className="invisible rounded p-0.5 group-hover:visible hover:bg-zinc-200 dark:hover:bg-zinc-700"><Plus size={14} /></button>}
            items={[
              { label: 'Novo projeto', testId: 'tree-new-project', onClick: () => { exp.ensure(key); d.openProjectForm({ companyId: c.id, folderId: null }) } },
              { label: 'Nova pasta', testId: 'tree-new-folder', onClick: () => { exp.ensure(key); d.newFolder(c.id, null) } }
            ]}
          />
        </Row>
        {open && (
          <>
            {s.folders.map((f) => folderRow(f, 1))}
            {s.projects.map((p) => projectRow(p, s.projects, 1))}
            {!s.folders.length && !s.projects.length && <div className="py-1 pl-8 text-xs text-zinc-400">Sem projetos</div>}
          </>
        )}
      </div>
    )
  }

  return (
    <div>
      <div className="mb-1 flex items-center justify-between px-2 text-[11px] font-semibold tracking-wider text-zinc-400">
        ESPAÇOS
        <button title="Nova empresa" className="rounded p-0.5 hover:bg-zinc-200 dark:hover:bg-zinc-700" onClick={() => d.openCompanyForm()}>
          <Plus size={14} />
        </button>
      </div>
      {tree?.map(spaceRow)}
    </div>
  )
}
