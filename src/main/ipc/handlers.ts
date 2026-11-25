import { z } from 'zod'
import type { Handler } from './registry'
import { h } from './registry'
import { getAllSettings, getSetting, setSetting } from '../services/settings'
import * as sys from './system'

import * as companies from '../services/companies'

const zid = z.number().int()
const ID = z.object({ id: zid })
const nullableStr = z.string().nullable().optional()
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
  // @@end
} satisfies Record<string, Handler>

void nullableStr

type Handlers = typeof handlers
export type ApiMethods = {
  [K in keyof Handlers]: Handlers[K] extends Handler<infer S, infer R>
    ? { input: z.input<S>; output: Awaited<R> }
    : never
}
