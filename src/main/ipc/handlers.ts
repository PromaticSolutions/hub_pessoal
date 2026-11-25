import { z } from 'zod'
import type { Handler } from './registry'
import { h } from './registry'
import { getAllSettings, getSetting, setSetting } from '../services/settings'
import * as sys from './system'

import * as companies from '../services/companies'
import * as folders from '../services/folders'
import * as projects from '../services/projects'
import * as boards from '../services/boards'
import * as columns from '../services/columns'
import * as tasks from '../services/tasks'

const zid = z.number().int()
const ID = z.object({ id: zid })
const nullableStr = z.string().nullable().optional()
const projectStatus = z.enum(['planned', 'active', 'paused', 'completed'])
const priority = z.enum(['low', 'medium', 'high', 'urgent'])
const category = z.enum(['todo', 'in_progress', 'done'])
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
  // @@end
} satisfies Record<string, Handler>


type Handlers = typeof handlers
export type ApiMethods = {
  [K in keyof Handlers]: Handlers[K] extends Handler<infer S, infer R>
    ? { input: z.input<S>; output: Awaited<R> }
    : never
}
