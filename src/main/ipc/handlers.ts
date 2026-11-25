import type { z } from 'zod'
import type { Handler } from './registry'

export const handlers = {} satisfies Record<string, Handler>

type Handlers = typeof handlers
export type ApiMethods = {
  [K in keyof Handlers]: Handlers[K] extends Handler<infer S, infer R>
    ? { input: z.input<S>; output: Awaited<R> }
    : never
}
