// Dev-only API (loaded by the Vite plugin through ssrLoadModule, so `?raw` and aliases work).
import '../tz'
import type { AppContext } from '../context'
import { handleRpc } from '../api/rpc'
import { createSupabaseAuth } from '../api/auth'
import { createDevContext, destroyDevContext, DEV_FILES_BASE } from '../context-dev'
import { flagOn } from '../context-prod'
import { verifyLocalUrl } from '../storage/local'
import { MIME } from '../services/attachments'
import { AppError } from '../lib/errors'
import { MAX_FILE_BYTES } from '@shared/constants'

export type DevEnv = Record<string, string | undefined>
export type DevReply = { status: number; headers: Record<string, string>; body: Uint8Array | string }

const text = (status: number, body: string): DevReply => ({ status, headers: { 'content-type': 'text/plain; charset=utf-8' }, body })

export function createDevApi(opts: { dataDir: string; env: DevEnv }) {
  const { env } = opts
  const devAuth = flagOn(env.HUB_DEV_AUTH) && !env.VERCEL
  let ctxP: Promise<AppContext> | undefined
  const getCtx = () => (ctxP ??= createDevContext({ dataDir: opts.dataDir }).catch((e) => { ctxP = undefined; throw e }))

  let supabaseAuth: ((req: Request) => Promise<{ email: string }>) | undefined
  const auth = async (req: Request) => {
    if (devAuth) return { email: 'dev@local' }
    const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL
    const anonKey = env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY
    if (!url || !anonKey || !env.ALLOWED_EMAIL) throw new Error('Dev sem login: defina HUB_DEV_AUTH=1 ou SUPABASE_URL, SUPABASE_ANON_KEY e ALLOWED_EMAIL.')
    return (supabaseAuth ??= createSupabaseAuth({ url, anonKey, allowedEmail: env.ALLOWED_EMAIL }))(req)
  }

  return {
    devAuth,
    /** `/api/dev/reset` is enabled only for e2e runs. */
    e2e: flagOn(env.HUB_E2E),
    rpc: (req: Request) => handleRpc(req, { ctx: getCtx, auth }),

    /** `GET|HEAD|PUT /api/dev-files/<key>?…` signed by the local Storage. */
    async file(method: string, key: string, query: URLSearchParams, body?: Uint8Array): Promise<DevReply> {
      const ctx = await getCtx()
      if (!verifyLocalUrl(ctx.storage, key, query, method)) return text(403, 'Link inválido ou expirado.')
      if (method === 'PUT') {
        if ((body?.length ?? 0) > MAX_FILE_BYTES) return text(413, 'Arquivo maior que 50 MB.')
        await ctx.storage.put(key, body ?? new Uint8Array())
        return text(200, 'ok')
      }
      let data: Uint8Array
      try {
        data = await ctx.storage.get(key)
      } catch (e) {
        if (e instanceof AppError && e.code === 'NOT_FOUND') return text(404, 'Arquivo não encontrado.')
        throw e
      }
      const ext = key.split('.').pop()?.toLowerCase() ?? ''
      const headers: Record<string, string> = { 'content-type': MIME[ext] ?? 'application/octet-stream', 'content-length': String(data.length), 'cache-control': 'private, max-age=600' }
      const dl = query.get('dl')
      if (dl) headers['content-disposition'] = `attachment; filename="${dl.replace(/[^\x20-\x7e]|["\\]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(dl)}`
      return { status: 200, headers, body: method === 'HEAD' ? '' : data }
    },

    /** Wipes the dev database and files and starts a fresh install (only with HUB_E2E=1). */
    async reset(): Promise<void> {
      if (ctxP) {
        const ctx = await ctxP.catch(() => undefined)
        ctxP = undefined
        if (ctx) await destroyDevContext(ctx, { dataDir: opts.dataDir })
      }
      await getCtx()
    },

    filesBase: DEV_FILES_BASE
  }
}

export type DevApi = ReturnType<typeof createDevApi>
