import { z } from 'zod'
import type { Handler } from './registry'
import { h } from './registry'
import { AppError } from '../lib/errors'
import { getAllSettings, getSetting, setSetting } from '../services/settings'
import * as sys from './system'

import * as companies from '../services/companies'
import * as folders from '../services/folders'
import * as projects from '../services/projects'
import * as boards from '../services/boards'
import * as columns from '../services/columns'
import * as tasks from '../services/tasks'
import * as labels from '../services/labels'
import * as comments from '../services/comments'
import * as checklists from '../services/checklists'
import * as attachments from '../services/attachments'
import * as taskQuery from '../services/taskQuery'
import * as dashboard from '../services/dashboard'
import * as calendar from '../services/calendar'
import * as searchSvc from '../services/search'

const zid = z.number().int()
const ID = z.object({ id: zid })
const nullableStr = z.string().nullable().optional()
const projectStatus = z.enum(['planned', 'active', 'paused', 'completed'])
const priority = z.enum(['low', 'medium', 'high', 'urgent'])
const category = z.enum(['todo', 'in_progress', 'done'])
export const taskFilter = z.object({
  companyIds: z.array(zid).optional(),
  projectIds: z.array(zid).optional(),
  statuses: z.array(z.enum(['todo', 'in_progress', 'done'])).optional(),
  priorities: z.array(z.enum(['low', 'medium', 'high', 'urgent'])).optional(),
  labelIds: z.array(zid).optional(),
  dueFrom: z.string().optional(),
  dueTo: z.string().optional(),
  scope: z.enum(['all', 'personal', 'professional']).optional(),
  overdueOnly: z.boolean().optional(),
  noDueOnly: z.boolean().optional(),
  includeDone: z.boolean().optional(),
  includeArchived: z.boolean().optional(),
  text: z.string().optional()
})
const between = { beforeId: zid.nullable(), afterId: zid.nullable() }

export const handlers = {
  // settings
  'settings.get': h(z.object({ key: z.string() }), (c, i) => getSetting<unknown>(c.db, i.key, null)),
  'settings.set': h(z.object({ key: z.string(), value: z.unknown() }), (c, i) => setSetting(c.db, i.key, i.value)),
  'settings.all': h(z.object({}), (c) => getAllSettings(c.db)),
  // system
  'system.dataPath': h(z.object({}), (c) => c.paths.root),
  'system.openDataFolder': h(z.object({}), async (c) => { await sys.openPath(c.paths.root) }),
  'system.pickFiles': h(z.object({ multiple: z.boolean(), images: z.boolean().optional() }), (_c, i) => sys.pickFiles(i)),
  'system.pickSavePath': h(z.object({ defaultPath: z.string() }), (_c, i) => sys.pickSavePath(i.defaultPath)),
  'system.pickOpenPath': h(z.object({ extensions: z.array(z.string()) }), (_c, i) => sys.pickOpenPath(i.extensions)),
  // companies
  'companies.list': h(z.object({ includeArchived: z.boolean().optional() }), (c, i) => companies.listCompanies(c, i)),
  'companies.get': h(ID, (c, i) => companies.getCompany(c, i.id)),
  'companies.create': h(z.object({ name: z.string(), description: z.string().optional(), color: z.string() }), (c, i) => companies.createCompany(c, i)),
  'companies.update': h(z.object({ id: zid, name: z.string().optional(), description: z.string().optional(), color: z.string().optional() }), (c, { id, ...p }) => companies.updateCompany(c, id, p)),
  'companies.setLogo': h(z.object({ id: zid, sourcePath: z.string().nullable() }), (c, i) => companies.setCompanyLogo(c, i.id, i.sourcePath)),
  'companies.archive': h(ID, (c, i) => companies.archiveCompany(c, i.id)),
  'companies.restore': h(ID, (c, i) => companies.restoreCompany(c, i.id)),
  'companies.deletionImpact': h(ID, (c, i) => companies.getCompanyDeletionImpact(c, i.id)),
  'companies.delete': h(ID, (c, i) => companies.deleteCompany(c, i.id)),
  'companies.reorder': h(z.object({ id: zid, ...between }), (c, { id, ...w }) => companies.reorderCompany(c, id, w)),
  'companies.logoDataUrl': h(ID, (c, i) => companies.getCompanyLogoDataUrl(c, i.id)),
  // spaces / folders
  'spaces.tree': h(z.object({ includeArchived: z.boolean().optional() }), (c, i) => projects.getSpaceTree(c, i)),
  'folders.create': h(z.object({ companyId: zid, parentId: zid.nullable(), name: z.string() }), (c, i) => folders.createFolder(c, i)),
  'folders.update': h(z.object({ id: zid, name: z.string().optional(), color: z.string().nullable().optional() }), (c, { id, ...p }) => folders.updateFolder(c, id, p)),
  'folders.move': h(z.object({ id: zid, companyId: zid, parentId: zid.nullable(), ...between }), (c, i) => folders.moveFolder(c, i)),
  'folders.archive': h(ID, (c, i) => folders.archiveFolder(c, i.id)),
  'folders.restore': h(ID, (c, i) => folders.restoreFolder(c, i.id)),
  'folders.delete': h(ID, (c, i) => folders.deleteFolder(c, i.id)),
  // projects
  'projects.get': h(ID, (c, i) => projects.getProject(c, i.id)),
  'projects.create': h(
    z.object({ companyId: zid, folderId: zid.nullable(), name: z.string(), description: z.string().optional(), color: z.string(), startDate: nullableStr, dueDate: nullableStr, status: projectStatus.optional() }),
    (c, i) => projects.createProject(c, i)
  ),
  'projects.update': h(
    z.object({ id: zid, name: z.string().optional(), description: z.string().optional(), color: z.string().optional(), startDate: nullableStr, dueDate: nullableStr, status: projectStatus.optional() }),
    (c, { id, ...p }) => projects.updateProject(c, id, p)
  ),
  'projects.move': h(z.object({ id: zid, companyId: zid, folderId: zid.nullable(), ...between }), (c, i) => projects.moveProject(c, i)),
  'projects.archive': h(ID, (c, i) => projects.archiveProject(c, i.id)),
  'projects.restore': h(ID, (c, i) => projects.restoreProject(c, i.id)),
  'projects.deletionImpact': h(ID, (c, i) => projects.getProjectDeletionImpact(c, i.id)),
  'projects.delete': h(ID, (c, i) => projects.deleteProject(c, i.id)),
  // boards
  'boards.create': h(z.object({ projectId: zid, name: z.string() }), (c, i) => boards.createBoard(c, i)),
  'boards.list': h(z.object({ projectId: zid, includeArchived: z.boolean().optional() }), (c, i) => boards.listBoards(c, i)),
  'boards.update': h(z.object({ id: zid, name: z.string() }), (c, { id, ...p }) => boards.updateBoard(c, id, p)),
  'boards.reorder': h(z.object({ id: zid, ...between }), (c, { id, ...w }) => boards.reorderBoard(c, id, w)),
  'boards.archive': h(ID, (c, i) => boards.archiveBoard(c, i.id)),
  'boards.restore': h(ID, (c, i) => boards.restoreBoard(c, i.id)),
  'boards.delete': h(ID, (c, i) => boards.deleteBoard(c, i.id)),
  'boards.get': h(z.object({ id: zid, includeArchived: z.boolean().optional() }), (c, { id, ...o }) => boards.getBoard(c, id, o)),
  // columns
  'columns.create': h(z.object({ boardId: zid, name: z.string(), category, afterId: zid.nullable().optional() }), (c, i) => columns.createColumn(c, i)),
  'columns.update': h(z.object({ id: zid, name: z.string().optional(), category: category.optional() }), (c, { id, ...p }) => columns.updateColumn(c, id, p)),
  'columns.move': h(z.object({ id: zid, ...between }), (c, i) => columns.moveColumn(c, i)),
  'columns.delete': h(z.object({ id: zid, moveTasksTo: zid.nullable() }), (c, i) => columns.deleteColumn(c, i)),
  // tasks (core)
  'tasks.create': h(
    z.object({ columnId: zid, title: z.string(), afterId: zid.nullable().optional(), description: z.string().optional(), priority: priority.optional(), startAt: nullableStr, dueAt: nullableStr }),
    (c, i) => tasks.createTask(c, i)
  ),
  'tasks.move': h(z.object({ id: zid, columnId: zid, ...between }), (c, i) => tasks.moveTask(c, i)),
  'tasks.setStatus': h(z.object({ id: zid, status: category }), (c, i) => tasks.setTaskStatus(c, i.id, i.status)),
  // labels
  'labels.list': h(z.object({}), (c) => labels.listLabels(c)),
  'labels.create': h(z.object({ name: z.string(), color: z.string() }), (c, i) => labels.createLabel(c, i)),
  'labels.update': h(z.object({ id: zid, name: z.string().optional(), color: z.string().optional() }), (c, { id, ...p }) => labels.updateLabel(c, id, p)),
  'labels.delete': h(ID, (c, i) => labels.deleteLabel(c, i.id)),
  'tasks.get': h(ID, (c, i) => tasks.getTask(c, i.id)),
  'tasks.update': h(
    z.object({ id: zid, title: z.string().optional(), description: z.string().optional(), priority: priority.optional(), startAt: nullableStr, dueAt: nullableStr }),
    (c, { id, ...p }) => tasks.updateTask(c, id, p)
  ),
  'tasks.duplicate': h(ID, (c, i) => tasks.duplicateTask(c, i.id)),
  'tasks.archive': h(ID, (c, i) => tasks.archiveTask(c, i.id)),
  'tasks.restore': h(ID, (c, i) => tasks.restoreTask(c, i.id)),
  'tasks.delete': h(ID, (c, i) => tasks.deleteTask(c, i.id)),
  'tasks.setLabels': h(z.object({ id: zid, labelIds: z.array(zid) }), (c, i) => tasks.setTaskLabels(c, i.id, i.labelIds)),
  'activity.list': h(z.object({ taskId: zid }), (c, i) => tasks.listActivity(c, i.taskId)),
  // comments
  'comments.add': h(z.object({ taskId: zid, body: z.string() }), (c, i) => comments.addComment(c, i)),
  'comments.update': h(z.object({ id: zid, body: z.string() }), (c, { id, ...p }) => comments.updateComment(c, id, p)),
  'comments.delete': h(ID, (c, i) => comments.deleteComment(c, i.id)),
  // checklists
  'checklists.add': h(z.object({ taskId: zid, title: z.string().optional() }), (c, i) => checklists.addChecklist(c, i)),
  'checklists.rename': h(z.object({ id: zid, title: z.string() }), (c, i) => checklists.renameChecklist(c, i.id, i.title)),
  'checklists.delete': h(ID, (c, i) => checklists.deleteChecklist(c, i.id)),
  'checklistItems.add': h(z.object({ checklistId: zid, text: z.string() }), (c, i) => checklists.addChecklistItem(c, i)),
  'checklistItems.update': h(z.object({ id: zid, text: z.string().optional(), done: z.boolean().optional() }), (c, { id, ...p }) => checklists.updateChecklistItem(c, id, p)),
  'checklistItems.move': h(z.object({ id: zid, checklistId: zid, ...between }), (c, i) => checklists.moveChecklistItem(c, i)),
  'checklistItems.delete': h(ID, (c, i) => checklists.deleteChecklistItem(c, i.id)),
  // attachments
  'attachments.add': h(z.object({ taskId: zid.optional(), projectId: zid.optional(), sourcePaths: z.array(z.string()).min(1) }), (c, i) => attachments.addAttachments(c, i)),
  'attachments.list': h(
    z.object({ companyId: zid.optional(), projectId: zid.optional(), taskId: zid.optional(), kind: z.enum(['image', 'pdf', 'document', 'other']).optional(), text: z.string().optional(), includeArchived: z.boolean().optional() }),
    (c, i) => attachments.listAttachments(c, i)
  ),
  'attachments.open': h(ID, async (c, i) => {
    const err = await sys.openPath(attachments.getAttachmentAbsPath(c, i.id))
    if (err) throw new AppError('INTERNAL', err)
  }),
  'attachments.reveal': h(ID, (c, i) => sys.revealPath(attachments.getAttachmentAbsPath(c, i.id))),
  'attachments.delete': h(ID, (c, i) => attachments.deleteAttachment(c, i.id)),
  'attachments.thumbnail': h(ID, (c, i) => attachments.getAttachmentDataUrl(c, i.id)),
  // task query
  'tasks.query': h(z.object({ filter: taskFilter, sort: z.enum(['due', 'priority', 'created', 'updated']), limit: z.number().int().optional() }), (c, i) => taskQuery.queryTasks(c, i)),
  'tasks.quickCreate': h(z.object({ projectId: zid, title: z.string(), dueAt: nullableStr, priority: priority.optional() }), (c, i) => taskQuery.quickCreateTask(c, i)),
  // dashboard
  'dashboard.get': h(
    z.object({ scope: z.union([z.enum(['all', 'personal', 'professional']), z.object({ companyId: zid }), z.object({ projectId: zid })]) }),
    (c, i) => dashboard.getDashboard(c, i)
  ),
  'calendar.items': h(z.object({ from: z.string(), to: z.string(), filter: taskFilter }), (c, i) => calendar.getCalendarItems(c, i)),
  'search.query': h(
    z.object({
      text: z.string(),
      types: z.array(z.enum(['task', 'comment', 'project', 'company', 'attachment'])).optional(),
      filter: taskFilter.extend({ createdFrom: z.string().optional(), createdTo: z.string().optional() }).optional(),
      limit: z.number().int().optional()
    }),
    (c, i) => searchSvc.search(c, i)
  ),
  // @@end
} satisfies Record<string, Handler>


type Handlers = typeof handlers
export type ApiMethods = {
  [K in keyof Handlers]: Handlers[K] extends Handler<infer S, infer R>
    ? { input: z.input<S>; output: Awaited<R> }
    : never
}
