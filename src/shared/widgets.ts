import type { TaskFilter } from './types'

export type DashboardScope = 'all' | 'personal' | 'professional' | { companyId: number } | { projectId: number }
export type WidgetType = 'kpi' | 'summary' | 'chart' | 'taskList' | 'projects' | 'shopping'
export type KpiMetric =
  | 'total' | 'todo' | 'inProgress' | 'done' | 'overdue' | 'nearDue' | 'activeProjects' | 'companies'
  | 'shoppingPending' | 'shoppingMonth' | 'ideasNew' | 'dayBlocks'
export type ChartData = 'byPriority' | 'byStatus' | 'byCompany' | 'byProject' | 'productivity' | 'createdVsCompleted' | 'shoppingByCategory'
export type ChartKind = 'bar' | 'stackedBar' | 'line' | 'pie' | 'donut' | 'table'
export type WidgetSource = { kind: 'inherit' } | { kind: 'scope'; scope: DashboardScope }

export type WidgetConfig = {
  source: WidgetSource
  color?: string
  metric?: KpiMetric
  metrics?: KpiMetric[]
  chart?: ChartKind
  data?: ChartData
  list?: 'overdue' | 'nearDue' | 'filter'
  filter?: TaskFilter
  limit?: number
}

export type WidgetSpec = { type: WidgetType; title: string; config: WidgetConfig; x: number; y: number; w: number; h: number }

export const KPI_LABELS: Record<KpiMetric, string> = {
  total: 'Total de tarefas',
  todo: 'Pendentes',
  inProgress: 'Em andamento',
  done: 'Concluídas',
  overdue: 'Atrasadas',
  nearDue: 'Vencendo em breve',
  activeProjects: 'Projetos ativos',
  companies: 'Empresas cadastradas',
  shoppingPending: 'Compras pendentes',
  shoppingMonth: 'Comprado no mês',
  ideasNew: 'Ideias novas',
  dayBlocks: 'Blocos de hoje'
}

export const CHART_DATA_LABELS: Record<ChartData, string> = {
  byPriority: 'Tarefas abertas por prioridade',
  byStatus: 'Tarefas por status',
  byCompany: 'Carga de trabalho por espaço',
  byProject: 'Tarefas abertas por projeto',
  productivity: 'Concluídas por semana',
  createdVsCompleted: 'Criadas × concluídas',
  shoppingByCategory: 'Compras por categoria (R$)'
}

export const CHART_KIND_LABELS: Record<ChartKind, string> = {
  bar: 'Barras',
  stackedBar: 'Barras empilhadas',
  line: 'Linhas',
  pie: 'Pizza',
  donut: 'Rosca',
  table: 'Tabela'
}

export const WIDGET_TYPE_LABELS: Record<WidgetType, string> = {
  kpi: 'Indicador numérico',
  summary: 'Card de resumo',
  chart: 'Gráfico',
  taskList: 'Lista de tarefas',
  projects: 'Projetos ativos',
  shopping: 'Compras pendentes'
}

const inherit: WidgetSource = { kind: 'inherit' }

export const WIDGET_DEFAULTS: Record<WidgetType, { title: string; w: number; h: number; config: WidgetConfig }> = {
  kpi: { title: 'Indicador', w: 3, h: 2, config: { source: inherit, metric: 'total' } },
  summary: { title: 'Resumo', w: 6, h: 3, config: { source: inherit, metrics: ['todo', 'inProgress', 'done', 'overdue'] } },
  chart: { title: 'Gráfico', w: 6, h: 7, config: { source: inherit, chart: 'bar', data: 'byPriority' } },
  taskList: { title: 'Tarefas atrasadas', w: 6, h: 6, config: { source: inherit, list: 'overdue', limit: 10 } },
  projects: { title: 'Projetos ativos', w: 6, h: 6, config: { source: inherit } },
  shopping: { title: 'Compras pendentes', w: 4, h: 6, config: { source: inherit } }
}

const kpis = (metrics: KpiMetric[], y = 0): WidgetSpec[] =>
  metrics.map((metric, i) => ({ type: 'kpi', title: KPI_LABELS[metric], config: { source: inherit, metric }, x: (i % 4) * 3, y: y + Math.floor(i / 4) * 2, w: 3, h: 2 }))

export type TemplateKey = 'geral' | 'profissional' | 'pessoal' | 'financeiro'

export const TEMPLATES: Record<TemplateKey, { name: string; scope: DashboardScope; widgets: WidgetSpec[] }> = {
  geral: {
    name: 'Geral',
    scope: 'all',
    widgets: [
      ...kpis(['total', 'todo', 'inProgress', 'done', 'overdue', 'nearDue', 'activeProjects', 'companies']),
      { type: 'taskList', title: 'Atrasadas', config: { source: inherit, list: 'overdue', limit: 10 }, x: 0, y: 4, w: 6, h: 6 },
      { type: 'taskList', title: 'Próximos vencimentos', config: { source: inherit, list: 'nearDue', limit: 10 }, x: 6, y: 4, w: 6, h: 6 },
      { type: 'chart', title: 'Carga de trabalho por espaço (tarefas abertas)', config: { source: inherit, chart: 'stackedBar', data: 'byCompany' }, x: 0, y: 10, w: 6, h: 7 },
      { type: 'chart', title: 'Tarefas abertas por prioridade', config: { source: inherit, chart: 'bar', data: 'byPriority' }, x: 6, y: 10, w: 6, h: 7 },
      { type: 'chart', title: 'Produtividade — criadas × concluídas por semana', config: { source: inherit, chart: 'line', data: 'createdVsCompleted' }, x: 0, y: 17, w: 6, h: 7 },
      { type: 'chart', title: 'Resumo por espaço', config: { source: inherit, chart: 'table', data: 'byCompany' }, x: 6, y: 17, w: 6, h: 7 }
    ]
  },
  profissional: {
    name: 'Profissional',
    scope: 'professional',
    widgets: [
      ...kpis(['total', 'overdue', 'nearDue', 'done']),
      { type: 'chart', title: 'Carga por empresa', config: { source: inherit, chart: 'stackedBar', data: 'byCompany' }, x: 0, y: 2, w: 6, h: 7 },
      { type: 'projects', title: 'Projetos ativos', config: { source: inherit }, x: 6, y: 2, w: 6, h: 7 },
      { type: 'taskList', title: 'Atrasadas', config: { source: inherit, list: 'overdue', limit: 10 }, x: 0, y: 9, w: 6, h: 6 },
      { type: 'taskList', title: 'Próximos vencimentos', config: { source: inherit, list: 'nearDue', limit: 10 }, x: 6, y: 9, w: 6, h: 6 }
    ]
  },
  pessoal: {
    name: 'Pessoal',
    scope: 'personal',
    widgets: [
      ...kpis(['todo', 'overdue', 'nearDue', 'dayBlocks']),
      { type: 'chart', title: 'Por prioridade', config: { source: inherit, chart: 'donut', data: 'byPriority' }, x: 0, y: 2, w: 4, h: 7 },
      { type: 'chart', title: 'Concluídas por semana', config: { source: inherit, chart: 'line', data: 'productivity' }, x: 4, y: 2, w: 8, h: 7 },
      { type: 'taskList', title: 'Próximos vencimentos', config: { source: inherit, list: 'nearDue', limit: 10 }, x: 0, y: 9, w: 8, h: 6 },
      { type: 'shopping', title: 'Compras pendentes', config: { source: inherit }, x: 8, y: 9, w: 4, h: 6 }
    ]
  },
  financeiro: {
    name: 'Financeiro',
    scope: 'all',
    widgets: [
      { type: 'kpi', title: 'Compras pendentes', config: { source: inherit, metric: 'shoppingPending' }, x: 0, y: 0, w: 4, h: 2 },
      { type: 'kpi', title: 'Comprado no mês', config: { source: inherit, metric: 'shoppingMonth' }, x: 4, y: 0, w: 4, h: 2 },
      { type: 'chart', title: 'Compras por categoria (R$)', config: { source: inherit, chart: 'bar', data: 'shoppingByCategory' }, x: 0, y: 2, w: 8, h: 8 },
      { type: 'shopping', title: 'Itens pendentes', config: { source: inherit }, x: 8, y: 0, w: 4, h: 10 }
    ]
  }
}

/** v1 dashboard scope setting ('all' | 'personal' | 'professional' | 'c:ID' | 'p:ID') → DashboardScope */
export function scopeFromV1(v: unknown): DashboardScope {
  if (v === 'personal' || v === 'professional') return v
  if (typeof v === 'string' && /^c:\d+$/.test(v)) return { companyId: Number(v.slice(2)) }
  if (typeof v === 'string' && /^p:\d+$/.test(v)) return { projectId: Number(v.slice(2)) }
  return 'all'
}
