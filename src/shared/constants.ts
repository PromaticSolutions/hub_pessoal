import type { ColumnCategory, Priority, ProjectStatus } from './types'

export const DEFAULT_COLUMNS: { name: string; category: ColumnCategory }[] = [
  { name: 'Backlog', category: 'todo' },
  { name: 'A fazer', category: 'todo' },
  { name: 'Em andamento', category: 'in_progress' },
  { name: 'Em validação', category: 'review' },
  { name: 'Concluído', category: 'done' }
]

export const PRIORITIES: Priority[] = ['urgent', 'high', 'medium', 'low']
export const PRIORITY_LABELS: Record<Priority, string> = { low: 'Baixa', medium: 'Média', high: 'Alta', urgent: 'Urgente' }
export const PRIORITY_ORDER: Record<Priority, number> = { urgent: 0, high: 1, medium: 2, low: 3 }
export const PRIORITY_COLORS: Record<Priority, string> = { urgent: '#dc2626', high: '#ea580c', medium: '#2563eb', low: '#6b7280' }

export const CATEGORIES: ColumnCategory[] = ['todo', 'in_progress', 'review', 'done']
export const CATEGORY_LABELS: Record<ColumnCategory, string> = { todo: 'A fazer', in_progress: 'Em andamento', review: 'Em validação', done: 'Concluído' }

export const PROJECT_STATUSES: ProjectStatus[] = ['planned', 'active', 'paused', 'completed']
export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  planned: 'Planejado',
  active: 'Ativo',
  paused: 'Pausado',
  completed: 'Concluído'
}

export const SPACE_COLORS = [
  '#6366F1', '#0EA5E9', '#10B981', '#84CC16', '#F59E0B',
  '#F97316', '#EF4444', '#EC4899', '#8B5CF6', '#64748B'
]

export const IDEA_STATUSES = ['new', 'analysis', 'developing', 'implemented', 'archived'] as const
export const IDEA_STATUS_LABELS: Record<(typeof IDEA_STATUSES)[number], string> = {
  new: 'Nova ideia',
  analysis: 'Em análise',
  developing: 'Em desenvolvimento',
  implemented: 'Implementada',
  archived: 'Arquivada'
}

export const SOFT_COLORS = [
  '#64748B', '#6366F1', '#0EA5E9', '#14B8A6', '#10B981', '#84CC16',
  '#EAB308', '#F59E0B', '#F97316', '#EF4444', '#EC4899', '#A855F7'
]

export const SETTINGS_DEFAULTS = {
  theme: 'system' as 'system' | 'light' | 'dark',
  nearDueDays: 7,
  weekStartsOn: 1 as 0 | 1,
  showStartMarkers: true
}

export const AUTO_BACKUP_KEEP = 30
/** Largest file accepted by Storage (bucket limit). */
export const MAX_FILE_BYTES = 50 * 1024 * 1024
/** Browser uploads under uploads/tmp/ not attached within this many hours are purged. */
export const TMP_UPLOAD_HOURS = 24
export const DELETED_ATTACHMENT_DAYS = 30
