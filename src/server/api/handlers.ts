import { z } from 'zod'
import type { Handler } from './registry'
import { h } from './registry'
import { version as APP_VERSION } from '../../../package.json'
import { getAllSettings, getSetting, setSetting } from '../services/settings'

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
import * as bulk from '../services/bulk'
import * as dayBlocks from '../services/dayBlocks'
import * as ideas from '../services/ideas'
import * as shopping from '../services/shopping'
import * as dashboards from '../services/dashboards'
import * as widgetData from '../services/widgetData'
import * as calendar from '../services/calendar'
import * as searchSvc from '../services/search'
import * as backup from '../services/backup'
import { AppError } from '../lib/errors'
import { LATEST_SCHEMA_VERSION } from '../db/migrate'

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
  text: z.string().optional(),
  createdFrom: z.string().optional(),
  createdTo: z.string().optional()
})
const ideaStatus = z.enum(['new', 'analysis', 'developing', 'implemented', 'archived'])
const ideaFields = z.object({
  description: z.string().optional(),
  category: z.string().optional(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
  status: ideaStatus.optional(),
  companyId: zid.nullable().optional(),
  projectId: zid.nullable().optional()
})
const shoppingFields = z.object({
  notes: z.string().optional(),
  quantity: z.number().optional(),
  unit: z.string().optional(),
  category: z.string().optional(),
  priceCents: z.number().int().nullable().optional(),
  url: z.string().nullable().optional(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).optional()
})
const dashScope = z.union([z.enum(['all', 'personal', 'professional']), z.object({ companyId: zid }), z.object({ projectId: zid })])
const widgetType = z.enum(['kpi', 'summary', 'chart', 'taskList', 'projects', 'shopping'])
const widgetConfig = z.object({
  source: z.union([z.object({ kind: z.literal('inherit') }), z.object({ kind: z.literal('scope'), scope: dashScope })]),
  color: z.string().optional(),
  metric: z.string().optional(),
  metrics: z.array(z.string()).optional(),
  chart: z.enum(['bar', 'stackedBar', 'line', 'pie', 'donut', 'table']).optional(),
  data: z.enum(['byPriority', 'byStatus', 'byCompany', 'byProject', 'productivity', 'createdVsCompleted', 'shoppingByCategory']).optional(),
  list: z.enum(['overdue', 'nearDue', 'filter']).optional(),
  filter: z.record(z.string(), z.unknown()).optional(),
  limit: z.number().int().optional()
})
const between = { beforeId: zid.nullable(), afterId: zid.nullable() }
const uploadRef = z.object({ key: z.string(), name: z.string(), size: z.number().int().nonnegative(), mime: z.string() })
const STAT_TABLES = ['companies', 'projects', 'tasks', 'attachments', 'ideas', 'shopping_items'] as const

export const handlers = {
  // settings
  'settings.get': h(z.object({ key: z.string() }), (c, i) => getSetting<unknown>(c.db, i.key, null)),
  'settings.set': h(z.object({ key: z.string(), value: z.unknown() }), (c, i) => setSetting(c.db, i.key, i.value)),
  'settings.all': h(z.object({}), (c) => getAllSettings(c.db)),
  // files (browser uploads go straight to Storage)
  'files.uploadUrl': h(z.object({ name: z.string() }), async (c, i) => {
    const key = attachments.newUploadKey(i.name)
    return { key, url: await c.storage.signedUploadUrl(key) }
  }),
  // companies
  'companies.list': h(z.object({ includeArchived: z.boolean().optional() }), (c, i) => companies.listCompanies(c, i)),
  'companies.get': h(ID, (c, i) => companies.getCompany(c, i.id)),
  'companies.create': h(z.object({ name: z.string(), description: z.string().optional(), color: z.string() }), (c, i) => companies.createCompany(c, i)),
  'companies.update': h(z.object({ id: zid, name: z.string().optional(), description: z.string().optional(), color: z.string().optional() }), (c, { id, ...p }) => companies.updateCompany(c, id, p)),
  'companies.setLogo': h(z.object({ id: zid, upload: uploadRef.nullable() }), (c, i) => companies.setCompanyLogo(c, i.id, i.upload)),
  'companies.archive': h(ID, (c, i) => companies.archiveCompany(c, i.id)),
  'companies.restore': h(ID, (c, i) => companies.restoreCompany(c, i.id)),
  'companies.deletionImpact': h(ID, (c, i) => companies.getCompanyDeletionImpact(c, i.id)),
  'companies.delete': h(ID, (c, i) => companies.deleteCompany(c, i.id)),
  'companies.reorder': h(z.object({ id: zid, ...between }), (c, { id, ...w }) => companies.reorderCompany(c, id, w)),
  'companies.logoUrl': h(ID, (c, i) => companies.getCompanyLogoUrl(c, i.id)),
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
  'boards.update': h(z.object({ id: zid, name: z.string().optional(), color: z.string().nullable().optional() }), (c, { id, ...p }) => boards.updateBoard(c, id, p)),
  'boards.reorder': h(z.object({ id: zid, ...between }), (c, { id, ...w }) => boards.reorderBoard(c, id, w)),
  'boards.archive': h(ID, (c, i) => boards.archiveBoard(c, i.id)),
  'boards.restore': h(ID, (c, i) => boards.restoreBoard(c, i.id)),
  'boards.delete': h(ID, (c, i) => boards.deleteBoard(c, i.id)),
  'boards.get': h(z.object({ id: zid, includeArchived: z.boolean().optional() }), (c, { id, ...o }) => boards.getBoard(c, id, o)),
  // columns
  'columns.create': h(z.object({ boardId: zid, name: z.string(), category, afterId: zid.nullable().optional() }), (c, i) => columns.createColumn(c, i)),
  'columns.update': h(z.object({ id: zid, name: z.string().optional(), category: category.optional(), color: z.string().nullable().optional() }), (c, { id, ...p }) => columns.updateColumn(c, id, p)),
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
    z.object({ id: zid, title: z.string().optional(), description: z.string().optional(), priority: priority.optional(), startAt: nullableStr, dueAt: nullableStr, color: z.string().nullable().optional() }),
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
  'attachments.add': h(z.object({ taskId: zid.optional(), projectId: zid.optional(), ideaId: zid.optional(), uploads: z.array(uploadRef).min(1) }), (c, i) => attachments.addAttachments(c, i)),
  'attachments.list': h(
    z.object({ companyId: zid.optional(), projectId: zid.optional(), taskId: zid.optional(), ideaId: zid.optional(), kind: z.enum(['image', 'pdf', 'document', 'other']).optional(), text: z.string().optional(), includeArchived: z.boolean().optional() }),
    (c, i) => attachments.listAttachments(c, i)
  ),
  'attachments.url': h(z.object({ id: zid, download: z.boolean().optional() }), (c, i) => attachments.getAttachmentUrl(c, i.id, { download: i.download })),
  'attachments.delete': h(ID, (c, i) => attachments.deleteAttachment(c, i.id)),
  // task query
  'tasks.query': h(z.object({ filter: taskFilter, sort: z.enum(['due', 'priority', 'created', 'updated', 'status']), limit: z.number().int().optional() }), (c, i) => taskQuery.queryTasks(c, i)),
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
      types: z.array(z.enum(['task', 'comment', 'project', 'company', 'attachment', 'idea'])).optional(),
      filter: taskFilter.optional(),
      limit: z.number().int().optional()
    }),
    (c, i) => searchSvc.search(c, i)
  ),
  // backup (gzipped JSON in Storage)
  'backup.create': h(z.object({}), async (c) => {
    const r = await backup.createBackup(c, 'manual')
    const url = await c.storage.signedUrl(r.key, { downloadName: `personal-task-hub-${backup.fileStamp(c.now())}.json.gz` })
    return { url, manifest: r.manifest }
  }),
  'backup.inspect': h(z.object({ key: z.string() }), (c, i) => backup.inspectBackup(c, i.key)),
  'backup.restore': h(z.object({ key: z.string() }), async (c, i) => (await backup.restoreBackup(c, i.key)).manifest),
  'backup.listAuto': h(z.object({}), (c) => backup.listAutoBackups(c)),
  'backup.restoreAuto': h(z.object({ key: z.string() }), async (c, i) => {
    if (!i.key.startsWith(backup.AUTO_PREFIX)) throw new AppError('VALIDATION', 'Backup automático inválido.')
    return (await backup.restoreBackup(c, i.key)).manifest
  }),
  // system info
  'system.dataStats': h(z.object({}), async (c) => {
    const counts: Record<string, number> = {}
    for (const t of STAT_TABLES) counts[t] = (await c.db.one<{ n: number }>(`SELECT count(*) n FROM ${t}`))!.n
    const att = (await c.db.one<{ n: number; s: number }>('SELECT count(*) n, coalesce(sum(size_bytes), 0) s FROM attachments'))!
    const storageBytes = (await c.storage.list('')).reduce((n, f) => n + f.size, 0)
    return { counts, storageBytes, attachmentCount: att.n, attachmentsBytes: att.s }
  }),
  'system.appInfo': h(z.object({}), () => ({ version: APP_VERSION, schemaVersion: LATEST_SCHEMA_VERSION })),
  'tasks.bulk': h(
    z.object({
      ids: z.array(zid).min(1),
      action: z.discriminatedUnion('kind', [
        z.object({ kind: z.literal('status'), status: category }),
        z.object({ kind: z.literal('priority'), priority }),
        z.object({ kind: z.literal('due'), dueAt: z.string().nullable() }),
        z.object({ kind: z.literal('move'), projectId: zid }),
        z.object({ kind: z.literal('archive') }),
        z.object({ kind: z.literal('restore') }),
        z.object({ kind: z.literal('delete') })
      ])
    }),
    (c, i) => bulk.bulkUpdate(c, i)
  ),
  // meu dia
  'dayBlocks.list': h(z.object({ date: z.string() }), (c, i) => dayBlocks.listBlocks(c, i)),
  'dayBlocks.create': h(
    z.object({ date: z.string(), startTime: z.string(), endTime: z.string(), taskId: zid.nullable().optional(), title: z.string().nullable().optional(), note: z.string().optional(), color: z.string().nullable().optional() }),
    (c, i) => dayBlocks.createBlock(c, i)
  ),
  'dayBlocks.update': h(
    z.object({ id: zid, date: z.string().optional(), startTime: z.string().optional(), endTime: z.string().optional(), taskId: zid.nullable().optional(), title: z.string().nullable().optional(), note: z.string().optional(), color: z.string().nullable().optional() }),
    (c, { id, ...p }) => dayBlocks.updateBlock(c, id, p)
  ),
  'dayBlocks.move': h(z.object({ id: zid, date: z.string(), startTime: z.string() }), (c, i) => dayBlocks.moveBlock(c, i)),
  'dayBlocks.setDone': h(z.object({ id: zid, done: z.boolean() }), (c, i) => dayBlocks.setBlockDone(c, i.id, i.done)),
  'dayBlocks.delete': h(ID, (c, i) => dayBlocks.deleteBlock(c, i.id)),
  'dayBlocks.copyFromDay': h(z.object({ from: z.string(), to: z.string() }), (c, i) => dayBlocks.copyFromDay(c, i)),
  // ideias
  'ideas.list': h(
    z.object({ status: z.array(ideaStatus).optional(), category: z.string().optional(), priority: priority.optional(), companyId: zid.optional(), labelId: zid.optional(), text: z.string().optional() }),
    (c, i) => ideas.listIdeas(c, i)
  ),
  'ideas.categories': h(z.object({}), (c) => ideas.listIdeaCategories(c)),
  'ideas.get': h(ID, (c, i) => ideas.getIdea(c, i.id)),
  'ideas.create': h(ideaFields.extend({ title: z.string() }), (c, i) => ideas.createIdea(c, i)),
  'ideas.update': h(ideaFields.extend({ id: zid, title: z.string().optional() }), (c, { id, ...p }) => ideas.updateIdea(c, id, p)),
  'ideas.setLabels': h(z.object({ id: zid, labelIds: z.array(zid) }), (c, i) => ideas.setIdeaLabels(c, i.id, i.labelIds)),
  'ideas.delete': h(ID, (c, i) => ideas.deleteIdea(c, i.id)),
  'ideas.toTask': h(z.object({ id: zid, projectId: zid }), (c, i) => ideas.convertIdeaToTask(c, i)),
  'ideas.toProject': h(z.object({ id: zid, companyId: zid, folderId: zid.nullable() }), (c, i) => ideas.convertIdeaToProject(c, i)),
  // compras
  'shopping.list': h(z.object({ status: z.enum(['pending', 'bought', 'all']).optional(), category: z.string().optional() }), (c, i) => shopping.listShopping(c, i)),
  'shopping.totals': h(z.object({}), (c) => shopping.shoppingTotals(c)),
  'shopping.categories': h(z.object({}), (c) => shopping.listShoppingCategories(c)),
  'shopping.create': h(shoppingFields.extend({ name: z.string() }), (c, i) => shopping.createShoppingItem(c, i)),
  'shopping.quickAdd': h(z.object({ text: z.string() }), (c, i) => shopping.quickAddShopping(c, i.text)),
  'shopping.update': h(shoppingFields.extend({ id: zid, name: z.string().optional() }), (c, { id, ...p }) => shopping.updateShoppingItem(c, id, p)),
  'shopping.setBought': h(z.object({ id: zid, bought: z.boolean() }), (c, i) => shopping.setBought(c, i.id, i.bought)),
  'shopping.delete': h(ID, (c, i) => shopping.deleteShoppingItem(c, i.id)),
  // dashboards personalizáveis
  'dashboards.list': h(z.object({}), (c) => dashboards.listDashboards(c)),
  'dashboards.get': h(ID, (c, i) => dashboards.getDashboardFull(c, i.id)),
  'dashboards.create': h(
    z.object({ name: z.string(), template: z.enum(['geral', 'profissional', 'pessoal', 'financeiro', 'empty']).optional(), duplicateOf: zid.optional() }),
    (c, i) => dashboards.createDashboard(c, i)
  ),
  'dashboards.rename': h(z.object({ id: zid, name: z.string() }), (c, i) => dashboards.renameDashboard(c, i.id, i.name)),
  'dashboards.setScope': h(z.object({ id: zid, scope: dashScope }), (c, i) => dashboards.setDashboardScope(c, i.id, i.scope)),
  'dashboards.delete': h(ID, (c, i) => dashboards.deleteDashboard(c, i.id)),
  'dashboards.addWidget': h(z.object({ dashboardId: zid, type: widgetType, title: z.string().optional(), config: widgetConfig.optional() }), (c, i) => dashboards.addWidget(c, i as never)),
  'dashboards.updateWidget': h(
    z.object({ id: zid, title: z.string().optional(), type: widgetType.optional(), config: widgetConfig.optional(), w: z.number().int().optional(), h: z.number().int().optional() }),
    (c, { id, ...p }) => dashboards.updateWidget(c, id, p as never)
  ),
  'dashboards.removeWidget': h(ID, (c, i) => dashboards.removeWidget(c, i.id)),
  'dashboards.saveLayout': h(
    z.object({ dashboardId: zid, items: z.array(z.object({ id: zid, x: z.number(), y: z.number(), w: z.number(), h: z.number() })) }),
    (c, i) => dashboards.saveLayout(c, i)
  ),
  'widgets.data': h(z.object({ widget: z.object({ type: widgetType, config: widgetConfig }), dashboardScope: dashScope }), (c, i) => widgetData.getWidgetData(c, i as never)),
  // @@end
} satisfies Record<string, Handler>


type Handlers = typeof handlers
export type ApiMethods = {
  [K in keyof Handlers]: Handlers[K] extends Handler<infer S, infer R>
    ? { input: z.input<S>; output: Awaited<R> }
    : never
}
