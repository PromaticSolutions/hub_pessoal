import type { AppContext } from '../context'
import { AppError } from '../lib/errors'
import { handlers } from './handlers'
import { dispatch, logError, type Envelope, type Handler } from './registry'

export type RpcDeps = {
  ctx: () => Promise<AppContext>
  /** Resolves the signed-in user; rejects (AppError UNAUTHORIZED) when the request is not allowed. */
  auth: (req: Request) => Promise<{ email: string }>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handlers?: Record<string, Handler<any, any>>
}

export const UNAUTHORIZED_MESSAGE = 'Sessão expirada. Entre novamente.'
const MAX_BODY_BYTES = 4 * 1024 * 1024

function json(body: Envelope, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
  })
}

const fail = (code: string, message: string, status = 200) => json({ ok: false, error: { code, message } }, status)

/** POST /api/rpc `{ method, input }` → Envelope. Auth failure → 401 UNAUTHORIZED. */
export async function handleRpc(req: Request, deps: RpcDeps): Promise<Response> {
  if (req.method !== 'POST') return fail('VALIDATION', 'Use POST.', 405)
  try {
    await deps.auth(req)
  } catch (e) {
    if (e instanceof AppError && e.code === 'UNAUTHORIZED') return fail('UNAUTHORIZED', UNAUTHORIZED_MESSAGE, 401)
    logError('auth', e)
    return fail('INTERNAL', 'Não foi possível verificar o login. Tente novamente.', 500)
  }
  let body: { method?: unknown; input?: unknown }
  try {
    const text = await req.text()
    if (text.length > MAX_BODY_BYTES) return fail('VALIDATION', 'Requisição grande demais.', 413)
    body = JSON.parse(text) as typeof body
  } catch {
    return fail('VALIDATION', 'Dados inválidos — corpo da requisição não é JSON.')
  }
  if (!body || typeof body !== 'object' || typeof body.method !== 'string') return fail('VALIDATION', 'Dados inválidos — informe o método.')
  let ctx: AppContext
  try {
    ctx = await deps.ctx()
  } catch (e) {
    logError('context', e)
    return fail('INTERNAL', 'Servidor indisponível. Tente novamente.', 500)
  }
  return json(await dispatch(deps.handlers ?? handlers, ctx, body.method, body.input))
}
