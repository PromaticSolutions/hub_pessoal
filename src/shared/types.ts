export type Priority = 'low' | 'medium' | 'high' | 'urgent'
export type ColumnCategory = 'todo' | 'in_progress' | 'done'
export type ProjectStatus = 'planned' | 'active' | 'paused' | 'completed'
export type CompanyStatus = 'active' | 'archived'

export type Company = {
  id: number
  name: string
  description: string
  color: string
  logoPath: string | null
  isPersonal: boolean
  status: CompanyStatus
  position: number
  createdAt: string
  updatedAt: string
  archivedAt: string | null
}

export type Folder = {
  id: number
  companyId: number
  parentId: number | null
  name: string
  color: string | null
  position: number
  archivedAt: string | null
  createdAt: string
  updatedAt: string
}

export type Project = {
  id: number
  companyId: number
  folderId: number | null
  name: string
  description: string
  color: string
  startDate: string | null
  dueDate: string | null
  status: ProjectStatus
  position: number
  archivedAt: string | null
  createdAt: string
  updatedAt: string
}

export type Board = {
  id: number
  projectId: number
  name: string
  color: string | null
  position: number
  archivedAt: string | null
  createdAt: string
  updatedAt: string
}

export type Column = {
  id: number
  boardId: number
  name: string
  color: string | null
  position: number
  category: ColumnCategory
  createdAt: string
  updatedAt: string
}

export type Task = {
  id: number
  boardId: number
  columnId: number
  title: string
  description: string
  priority: Priority
  startAt: string | null
  dueAt: string | null
  completedAt: string | null
  archivedAt: string | null
  position: number
  color: string | null
  createdAt: string
  updatedAt: string
}

export type Label = { id: number; name: string; color: string }

export type Comment = { id: number; taskId: number; body: string; createdAt: string; updatedAt: string }

export type Checklist = { id: number; taskId: number; title: string; position: number }

export type ChecklistItem = {
  id: number
  checklistId: number
  text: string
  done: boolean
  position: number
  createdAt: string
  completedAt: string | null
}

export type Attachment = {
  id: number
  taskId: number | null
  projectId: number | null
  originalName: string
  storedPath: string
  mimeType: string
  sizeBytes: number
  createdAt: string
}

export type ActivityEntry = {
  id: number
  entityType: string
  entityId: number
  taskId: number | null
  action: string
  field: string | null
  oldValue: string | null
  newValue: string | null
  createdAt: string
}

export type CardSummary = {
  id: number
  boardId: number
  columnId: number
  title: string
  priority: Priority
  dueAt: string | null
  startAt: string | null
  position: number
  archivedAt: string | null
  completedAt: string | null
  createdAt: string
  color: string | null
  labels: Label[]
  checklistDone: number
  checklistTotal: number
  commentCount: number
  attachmentCount: number
  isOverdue: boolean
  status: ColumnCategory
}

export type TaskListItem = CardSummary & {
  boardName: string
  projectId: number
  projectName: string
  projectColor: string
  companyId: number
  companyName: string
  companyColor: string
  isPersonal: boolean
  updatedAt: string
  isNearDue: boolean
  scheduled?: boolean
}

export type TaskFilter = {
  companyIds?: number[]
  projectIds?: number[]
  statuses?: ColumnCategory[]
  priorities?: Priority[]
  labelIds?: number[]
  dueFrom?: string
  dueTo?: string
  scope?: 'all' | 'personal' | 'professional'
  overdueOnly?: boolean
  noDueOnly?: boolean
  includeDone?: boolean
  includeArchived?: boolean
  text?: string
  createdFrom?: string
  createdTo?: string
}

export type TaskSort = 'due' | 'priority' | 'created' | 'updated' | 'status'

export type BulkAction =
  | { kind: 'status'; status: ColumnCategory }
  | { kind: 'priority'; priority: Priority }
  | { kind: 'due'; dueAt: string | null }
  | { kind: 'move'; projectId: number }
  | { kind: 'archive' }
  | { kind: 'restore' }
  | { kind: 'delete' }
