import { useState } from 'react'
import type { ChartData, ChartKind, DashboardScope, KpiMetric, WidgetConfig, WidgetType } from '@shared/widgets'
import { CHART_DATA_LABELS, CHART_KIND_LABELS, KPI_LABELS, WIDGET_DEFAULTS, WIDGET_TYPE_LABELS } from '@shared/widgets'
import { Button, Field, Input, Modal, Select } from '../../components/ui'
import { ColorChoice } from '../../components/ColorChoice'
import { useApiQuery } from '../../lib/queries'
import { allProjects } from '../week/TaskFilters'
import type { WidgetRecord } from './widgets'

export const scopeToValue = (s: DashboardScope): string =>
  typeof s === 'string' ? s : 'companyId' in s ? `c:${s.companyId}` : `p:${s.projectId}`
export const valueToScope = (v: string): DashboardScope =>
  v.startsWith('c:') ? { companyId: Number(v.slice(2)) } : v.startsWith('p:') ? { projectId: Number(v.slice(2)) } : (v as 'all' | 'personal' | 'professional')

/** Option elements for scope selects (returned as data: the custom Select reads <option> children directly). */
export function useScopeOptions() {
  const { data: tree } = useApiQuery('spaces.tree', {})
  return (
    <>
      <option value="all">Tudo</option>
      <option value="personal">Pessoal</option>
      <option value="professional">Profissional</option>
      <optgroup label="Espaço">
        {tree?.map((s) => <option key={s.company.id} value={`c:${s.company.id}`}>{s.company.name}</option>)}
      </optgroup>
      <optgroup label="Projeto">
        {allProjects(tree).map((p) => <option key={p.id} value={`p:${p.id}`}>{p.name}</option>)}
      </optgroup>
    </>
  )
}

const SIZES: Record<WidgetType, { label: string; w: number; h: number }[]> = {
  kpi: [{ label: 'P', w: 3, h: 2 }, { label: 'M', w: 4, h: 2 }, { label: 'G', w: 6, h: 3 }],
  summary: [{ label: 'P', w: 4, h: 3 }, { label: 'M', w: 6, h: 3 }, { label: 'G', w: 12, h: 3 }],
  chart: [{ label: 'P', w: 4, h: 6 }, { label: 'M', w: 6, h: 7 }, { label: 'G', w: 12, h: 8 }],
  taskList: [{ label: 'P', w: 4, h: 5 }, { label: 'M', w: 6, h: 6 }, { label: 'G', w: 12, h: 8 }],
  projects: [{ label: 'P', w: 4, h: 5 }, { label: 'M', w: 6, h: 6 }, { label: 'G', w: 12, h: 8 }],
  shopping: [{ label: 'P', w: 3, h: 5 }, { label: 'M', w: 4, h: 6 }, { label: 'G', w: 6, h: 8 }]
}

export type EditorResult = { type: WidgetType; title: string; config: WidgetConfig; w?: number; h?: number }

export function WidgetEditor({ initial, onSave, onClose }: { initial: WidgetRecord | null; onSave: (r: EditorResult) => void; onClose: () => void }) {
  const [type, setType] = useState<WidgetType>(initial?.type ?? 'chart')
  const [title, setTitle] = useState(initial?.title ?? WIDGET_DEFAULTS.chart.title)
  const [config, setConfig] = useState<WidgetConfig>((initial?.config as WidgetConfig) ?? WIDGET_DEFAULTS.chart.config)
  const [size, setSize] = useState<{ w: number; h: number } | null>(null)
  const scopeOptions = useScopeOptions()
  const set = (patch: Partial<WidgetConfig>) => setConfig((c) => ({ ...c, ...patch }))
  const sourceValue = config.source?.kind === 'scope' ? scopeToValue(config.source.scope) : 'inherit'
  const changeType = (t: WidgetType) => {
    setType(t)
    if (!initial || initial.type !== t) {
      setTitle(WIDGET_DEFAULTS[t].title)
      setConfig({ ...WIDGET_DEFAULTS[t].config, source: config.source })
    }
  }
  return (
    <Modal open onClose={onClose} title={initial ? 'Configurar bloco' : 'Adicionar bloco'} width="max-w-xl" testId="widget-editor">
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Tipo de bloco">
            <Select data-testid="widget-type" className="w-full" value={type} onChange={(e) => changeType(e.target.value as WidgetType)}>
              {(Object.keys(WIDGET_TYPE_LABELS) as WidgetType[]).map((t) => <option key={t} value={t}>{WIDGET_TYPE_LABELS[t]}</option>)}
            </Select>
          </Field>
          <Field label="Título">
            <Input data-testid="widget-title" value={title} onChange={(e) => setTitle(e.target.value)} />
          </Field>
        </div>
        {type === 'kpi' && (
          <Field label="Indicador">
            <Select data-testid="widget-metric" className="w-full" value={config.metric ?? 'total'} onChange={(e) => { set({ metric: e.target.value as KpiMetric }); setTitle(KPI_LABELS[e.target.value as KpiMetric]) }}>
              {(Object.keys(KPI_LABELS) as KpiMetric[]).map((m) => <option key={m} value={m}>{KPI_LABELS[m]}</option>)}
            </Select>
          </Field>
        )}
        {type === 'summary' && (
          <div className="flex flex-col gap-1.5 text-xs font-medium text-zinc-500">
            Indicadores exibidos
            <div className="grid grid-cols-2 gap-1 text-sm font-normal text-zinc-800 dark:text-zinc-200">
              {(Object.keys(KPI_LABELS) as KpiMetric[]).map((m) => (
                <label key={m} className="flex items-center gap-2">
                  <input type="checkbox" checked={!!config.metrics?.includes(m)} onChange={(e) => set({ metrics: e.target.checked ? [...(config.metrics ?? []), m] : (config.metrics ?? []).filter((x) => x !== m) })} />
                  {KPI_LABELS[m]}
                </label>
              ))}
            </div>
          </div>
        )}
        {type === 'chart' && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Tipo de gráfico">
              <Select data-testid="widget-chart" className="w-full" value={config.chart ?? 'bar'} onChange={(e) => set({ chart: e.target.value as ChartKind })}>
                {(Object.keys(CHART_KIND_LABELS) as ChartKind[]).map((k) => <option key={k} value={k}>{CHART_KIND_LABELS[k]}</option>)}
              </Select>
            </Field>
            <Field label="Dados">
              <Select data-testid="widget-data" className="w-full" value={config.data ?? 'byPriority'} onChange={(e) => { set({ data: e.target.value as ChartData }); setTitle(CHART_DATA_LABELS[e.target.value as ChartData]) }}>
                {(Object.keys(CHART_DATA_LABELS) as ChartData[]).map((d) => <option key={d} value={d}>{CHART_DATA_LABELS[d]}</option>)}
              </Select>
            </Field>
          </div>
        )}
        {type === 'taskList' && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Mostrar">
              <Select className="w-full" value={config.list ?? 'overdue'} onChange={(e) => set({ list: e.target.value as WidgetConfig['list'] })}>
                <option value="overdue">Tarefas atrasadas</option>
                <option value="nearDue">Próximas do vencimento</option>
                <option value="filter">Todas as abertas (por vencimento)</option>
              </Select>
            </Field>
            <Field label="Quantidade">
              <Input type="number" min={1} max={50} value={config.limit ?? 10} onChange={(e) => set({ limit: Math.max(1, Math.min(50, Number(e.target.value) || 10)), filter: config.list === 'filter' ? { includeDone: false } : config.filter })} />
            </Field>
          </div>
        )}
        <Field label="Fonte dos dados">
          <Select data-testid="widget-source" className="w-full" value={sourceValue} onChange={(e) => set({ source: e.target.value === 'inherit' ? { kind: 'inherit' } : { kind: 'scope', scope: valueToScope(e.target.value) } })}>
            <option value="inherit">Igual ao dashboard</option>
            {scopeOptions}
          </Select>
        </Field>
        {(type === 'kpi' || type === 'chart') && (
          <div className="flex flex-col gap-1.5 text-xs font-medium text-zinc-500">
            Cor
            <ColorChoice value={config.color ?? null} onChange={(c) => set({ color: c ?? undefined })} />
          </div>
        )}
        <div className="flex items-center gap-2 text-xs font-medium text-zinc-500">
          Tamanho
          {SIZES[type].map((s) => (
            <button key={s.label} type="button" onClick={() => setSize(s)} className={`rounded-[4px] border px-2 py-1 ${size?.w === s.w && size?.h === s.h ? 'border-indigo-500 bg-indigo-500/10 text-indigo-700' : 'border-[var(--line-strong)]'}`}>{s.label}</button>
          ))}
          <span className="font-normal">(arraste a borda do bloco para ajustar livremente)</span>
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" data-testid="widget-save" onClick={() => onSave({ type, title: title.trim() || WIDGET_DEFAULTS[type].title, config, ...(size ?? {}) })}>
            {initial ? 'Salvar' : 'Adicionar'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
