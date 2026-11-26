import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import ReactGridLayout, { useContainerWidth, verticalCompactor, type Layout } from 'react-grid-layout'
import 'react-grid-layout/css/styles.css'
import { Check, LayoutGrid, MoreHorizontal, Pencil, Plus } from 'lucide-react'
import type { TemplateKey } from '@shared/widgets'
import { Button, Field, Input, Menu, Modal, PageHeader, Select, useConfirm, usePrompt } from '../../components/ui'
import { useApiQuery, useCall } from '../../lib/queries'
import { api } from '../../lib/api'
import { useToast } from '../../components/toast'
import { WidgetFrame, type WidgetRecord } from './widgets'
import { useScopeOptions, WidgetEditor, scopeToValue, valueToScope, type EditorResult } from './WidgetEditor'

function NewDashboardDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (id: number) => void }) {
  const [name, setName] = useState('')
  const [template, setTemplate] = useState<TemplateKey | 'empty'>('empty')
  const call = useCall()
  return (
    <Modal open onClose={onClose} title="Novo dashboard" testId="new-dashboard">
      <form
        className="space-y-3"
        onSubmit={async (e) => {
          e.preventDefault()
          if (!name.trim()) return
          const d = await call('dashboards.create', { name, template })
          onCreated(d.id)
          onClose()
        }}
      >
        <Field label="Nome"><Input data-testid="new-dashboard-name" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Financeiro" /></Field>
        <Field label="Começar a partir de">
          <Select data-testid="new-dashboard-template" className="w-full" value={template} onChange={(e) => setTemplate(e.target.value as TemplateKey | 'empty')}>
            <option value="empty">Dashboard vazio</option>
            <option value="geral">Modelo Geral</option>
            <option value="profissional">Modelo Profissional</option>
            <option value="pessoal">Modelo Pessoal</option>
            <option value="financeiro">Modelo Financeiro (compras)</option>
          </Select>
        </Field>
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Cancelar</Button>
          <Button type="submit" variant="primary" data-testid="new-dashboard-ok" disabled={!name.trim()}>Criar</Button>
        </div>
      </form>
    </Modal>
  )
}

export default function DashboardPage() {
  const [params] = useSearchParams()
  const spaceParam = params.get('space')
  const { data: dashboards } = useApiQuery('dashboards.list', {})
  const { data: activeSetting } = useApiQuery('settings.get', { key: 'dashboard.active' })
  const [activeLocal, setActiveLocal] = useState<number | null>(null)
  const activeId = activeLocal ?? (typeof activeSetting === 'number' && dashboards?.some((d) => d.id === activeSetting) ? activeSetting : dashboards?.[0]?.id ?? null)
  const { data: full } = useApiQuery('dashboards.get', { id: activeId ?? 0 }, { enabled: activeId != null })
  const [editing, setEditing] = useState(false)
  const [editor, setEditor] = useState<{ widget: WidgetRecord | null } | null>(null)
  const [creating, setCreating] = useState(false)
  const [overrides, setOverrides] = useState<Record<string, { x: number; y: number; w: number; h: number }>>({})
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const call = useCall()
  const confirm = useConfirm()
  const prompt = usePrompt()
  const toast = useToast()
  const { width, containerRef, mounted } = useContainerWidth()
  const scopeOptions = useScopeOptions()

  const widgets = useMemo(() => full?.widgets ?? [], [full])
  // Server positions, overridden by what the user moved in this session (never drops a widget).
  const layout: Layout = useMemo(
    () => widgets.map((w) => ({ i: String(w.id), ...(overrides[String(w.id)] ?? { x: w.x, y: w.y, w: w.w, h: w.h }), minW: 2, minH: 2 })),
    [widgets, overrides]
  )
  useEffect(() => setOverrides({}), [activeId])

  const scope = spaceParam ? valueToScope(`c:${spaceParam}`) : full?.dashboard.scope ?? 'all'
  const choose = (id: number) => {
    setActiveLocal(id)
    setEditing(false)
    api('settings.set', { key: 'dashboard.active', value: id }).catch(() => {})
  }
  const onLayoutChange = (l: Layout) => {
    if (!editing || !activeId) return
    setOverrides((o) => {
      const next = { ...o }
      for (const it of l) next[it.i] = { x: it.x, y: it.y, w: it.w, h: it.h }
      return next
    })
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      const ids = new Set(widgets.map((w) => String(w.id)))
      api('dashboards.saveLayout', { dashboardId: activeId, items: l.filter((it) => ids.has(it.i)).map((it) => ({ id: Number(it.i), x: it.x, y: it.y, w: it.w, h: it.h })) }).catch((e) => toast.error(e.message))
    }, 400)
  }
  const saveEditor = async (r: EditorResult) => {
    if (!activeId || !editor) return
    if (editor.widget) {
      await call('dashboards.updateWidget', { id: editor.widget.id, type: r.type, title: r.title, config: r.config as never, w: r.w, h: r.h })
      if (r.w || r.h) setOverrides((o) => { const n = { ...o }; delete n[String(editor.widget!.id)]; return n })
    }
    else {
      const w = await call('dashboards.addWidget', { dashboardId: activeId, type: r.type, title: r.title, config: r.config as never })
      if (r.w || r.h) await call('dashboards.updateWidget', { id: w.id, w: r.w, h: r.h })
    }
    setEditor(null)
  }

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite'

  return (
    <div className="flex-1 overflow-y-auto">
      <PageHeader title="Dashboard">
        <Select data-testid="dashboard-select" value={activeId ?? ''} onChange={(e) => choose(Number(e.target.value))} aria-label="Dashboard">
          {dashboards?.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </Select>
        <Select
          data-testid="dashboard-scope"
          aria-label="Escopo"
          value={scopeToValue(scope)}
          onChange={async (e) => { if (activeId) await call('dashboards.setScope', { id: activeId, scope: valueToScope(e.target.value) as never }) }}
        >
          {scopeOptions}
        </Select>
        {editing ? (
          <>
            <Button data-testid="widget-add" onClick={() => setEditor({ widget: null })}><Plus size={14} /> Adicionar bloco</Button>
            <Button variant="primary" data-testid="dashboard-edit-done" onClick={() => setEditing(false)}><Check size={14} /> Concluir</Button>
          </>
        ) : (
          <Button data-testid="dashboard-edit" onClick={() => setEditing(true)}><Pencil size={14} /> Editar layout</Button>
        )}
        <Menu
          trigger={<Button variant="ghost" aria-label="Mais opções" data-testid="dashboard-menu"><MoreHorizontal size={16} /></Button>}
          items={[
            { label: 'Novo dashboard…', testId: 'dashboard-new', icon: <LayoutGrid size={14} />, onClick: () => setCreating(true) },
            { label: 'Duplicar este', onClick: async () => { if (!full) return; const d = await call('dashboards.create', { name: `${full.dashboard.name} (cópia)`, duplicateOf: full.dashboard.id }); choose(d.id) } },
            { label: 'Renomear…', onClick: async () => { if (!full) return; const n = await prompt({ title: 'Renomear dashboard', initial: full.dashboard.name }); if (n) await call('dashboards.rename', { id: full.dashboard.id, name: n }) } },
            'separator',
            {
              label: 'Excluir dashboard',
              danger: true,
              onClick: async () => {
                if (!full) return
                if (await confirm({ title: `Excluir o dashboard "${full.dashboard.name}"?`, description: 'Os blocos deste dashboard serão removidos. Nenhuma tarefa é afetada.', danger: true, confirmLabel: 'Excluir' })) {
                  await call('dashboards.delete', { id: full.dashboard.id })
                  setActiveLocal(null)
                }
              }
            }
          ]}
        />
      </PageHeader>
      <div className="px-6 pb-6">
        <div className="mb-2 text-sm text-zinc-500">{greeting} — {format(new Date(), "EEEE, d 'de' MMMM 'de' yyyy", { locale: ptBR })}{editing && ' · arraste pelos ⋮⋮ e redimensione pelo canto inferior direito'}</div>
        <div ref={containerRef} className="-mx-[7px]">
          {mounted && full && (
            widgets.length ? (
              <ReactGridLayout
                width={width}
                layout={layout}
                gridConfig={{ cols: 12, rowHeight: 40, margin: [14, 14], containerPadding: [7, 7] }}
                dragConfig={{ enabled: editing, handle: '.widget-drag' }}
                resizeConfig={{ enabled: editing, handles: ['se'] }}
                compactor={verticalCompactor}
                onLayoutChange={onLayoutChange}
              >
                {widgets.map((w) => (
                  <div key={String(w.id)}>
                    <WidgetFrame
                      w={w}
                      scope={scope}
                      editing={editing}
                      onEdit={() => setEditor({ widget: w })}
                      onRemove={async () => { if (await confirm({ title: `Remover o bloco "${w.title}"?`, confirmLabel: 'Remover', danger: true })) await call('dashboards.removeWidget', { id: w.id }) }}
                    />
                  </div>
                ))}
              </ReactGridLayout>
            ) : (
              <div className="mx-[7px] flex flex-col items-center gap-3 rounded-md border border-dashed border-[var(--line-strong)] p-10 text-sm text-zinc-500">
                Este dashboard está vazio.
                <Button variant="primary" onClick={() => { setEditing(true); setEditor({ widget: null }) }}><Plus size={14} /> Adicionar bloco</Button>
              </div>
            )
          )}
        </div>
      </div>
      {editor && <WidgetEditor key={editor.widget?.id ?? 'new'} initial={editor.widget} onSave={saveEditor} onClose={() => setEditor(null)} />}
      {creating && <NewDashboardDialog onClose={() => setCreating(false)} onCreated={(id) => choose(id)} />}
    </div>
  )
}
