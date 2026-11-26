import type { AppContext } from '../context'

/** Runs `fn` in a transaction; every query inside must use the ctx it receives. */
export function withTx<T>(ctx: AppContext, fn: (ctx: AppContext) => Promise<T>): Promise<T> {
  return ctx.db.tx((db) => fn({ ...ctx, db }))
}
