import { z } from 'zod'
import type { Handler } from './registry'
import { h } from './registry'
import { getAllSettings, getSetting, setSetting } from '../services/settings'
import * as sys from './system'

const id = z.object({ id: z.number().int() })
void id

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
  'system.pickOpenPath': h(z.object({ extensions: z.array(z.string()) }), (_c, i) => sys.pickOpenPath(i.extensions))
} satisfies Record<string, Handler>

type Handlers = typeof handlers
export type ApiMethods = {
  [K in keyof Handlers]: Handlers[K] extends Handler<infer S, infer R>
    ? { input: z.input<S>; output: Awaited<R> }
    : never
}
