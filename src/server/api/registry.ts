import { z } from 'zod'
import type { AppContext } from '../context'
import { AppError } from '../lib/errors'

export type Handler<S extends z.ZodType = z.ZodType, R = unknown> = {
  schema: S
  fn: (ctx: AppContext, input: z.output<S>) => R
}

export function h<S extends z.ZodType, R>(schema: S, fn: (ctx: AppContext, input: z.output<S>) => R): Handler<S, R> {
  return { schema, fn }
}

export type Envelope = { ok: true; data: unknown } | { ok: false; error: { code: string; message: string } }

/** Logs an unexpected error (method + message + stack; never inputs, env or headers). */
export function logError(method: string, err: unknown): void {
  try {
    const detail = err instanceof Error ? `${err.message}\n${err.stack ?? ''}` : String(err)
    console.error(`[rpc] ${method}: ${detail}`)
  } catch {
    /* logging must never throw */
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function dispatch(handlers: Record<string, Handler<any, any>>, ctx: AppContext, method: string, input: unknown): Promise<Envelope> {
  const handler = handlers[method]
  if (!handler) return { ok: false, error: { code: 'NOT_FOUND', message: `Método desconhecido: ${method}` } }
  const parsed = handler.schema.safeParse(input ?? {})
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i: { path: PropertyKey[]; message: string }) => `${i.path.map(String).join('.') || 'entrada'}: ${i.message}`).join('; ')
    return { ok: false, error: { code: 'VALIDATION', message: `Dados inválidos — ${msg}` } }
  }
  try {
    const data = await handler.fn(ctx, parsed.data)
    return { ok: true, data: data === undefined ? null : data }
  } catch (err) {
    if (err instanceof AppError) return { ok: false, error: { code: err.code, message: err.message } }
    logError(method, err)
    return { ok: false, error: { code: 'INTERNAL', message: 'Erro inesperado no servidor. Tente novamente.' } }
  }
}
