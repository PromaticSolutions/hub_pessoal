import { createClient } from '@supabase/supabase-js'
import { createRemoteJWKSet, jwtVerify } from 'jose'
import { AppError } from '../lib/errors'

const CACHE_MS = 60_000
const CACHE_MAX = 200

type GetUser = (token: string) => Promise<{ email: string | null } | null>

const unauthorized = () => new AppError('UNAUTHORIZED', 'Sessão expirada. Entre novamente.')

export function bearerToken(req: Request): string | null {
  const m = /^Bearer\s+(\S+)\s*$/i.exec(req.headers.get('authorization') ?? '')
  return m ? m[1] : null
}

/**
 * Checks `Authorization: Bearer <Supabase access token>` with `auth.getUser(token)` (cached 60 s per
 * token) and accepts only `allowedEmail` (case-insensitive). Rejects with AppError UNAUTHORIZED.
 * `getUser` can be injected (tests); by default it calls Supabase.
 */
export function createSupabaseAuth(opts: { url: string; anonKey: string; allowedEmail: string; getUser?: GetUser }): (req: Request) => Promise<{ email: string }> {
  const allowed = opts.allowedEmail.trim().toLowerCase()
  if (!allowed) throw new Error('ALLOWED_EMAIL não definido.')
  let getUser = opts.getUser
  if (!getUser) {
    const client = createClient(opts.url, opts.anonKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } })
    getUser = async (token) => {
      let res: Awaited<ReturnType<typeof client.auth.getUser>>
      try {
        res = await client.auth.getUser(token)
      } catch (e) {
        throw new AppError('UNAVAILABLE', `Supabase auth indisponível (rede: ${e instanceof Error ? e.message : String(e)}).`)
      }
      const { data, error } = res
      if (error) {
        // 4xx = bad/expired token; anything else (network, 5xx) is a server problem, not a logout.
        const status = (error as { status?: number }).status
        if (status && status >= 400 && status < 500) return null
        throw new AppError('UNAVAILABLE', `Supabase auth indisponível (${status || 'rede'}).`)
      }
      return data.user ? { email: data.user.email ?? null } : null
    }
  }
  // Fast path: verify the token locally against the project's JWKS (ES256), no network per request.
  // Falls back to getUser when the project signs with a legacy shared secret or the JWKS is unreachable.
  const viaApi = getUser
  if (!opts.getUser) {
    const jwks = createRemoteJWKSet(new URL(`${opts.url.replace(/\/$/, '')}/auth/v1/.well-known/jwks.json`), { cacheMaxAge: 10 * 60_000 })
    const issuer = `${opts.url.replace(/\/$/, '')}/auth/v1`
    getUser = async (token) => {
      try {
        const { payload } = await jwtVerify(token, jwks, { issuer, audience: 'authenticated' })
        return { email: typeof payload.email === 'string' ? payload.email : null }
      } catch (e) {
        const code = (e as { code?: string }).code ?? ''
        // Expired / bad signature / wrong claims → logged out. Key lookup problems → ask Supabase.
        if (code.startsWith('ERR_JWT') || code === 'ERR_JWS_SIGNATURE_VERIFICATION_FAILED') return null
        return viaApi!(token)
      }
    }
  }
  const cache = new Map<string, { email: string; until: number }>()
  return async (req) => {
    const token = bearerToken(req)
    if (!token) throw unauthorized()
    const now = Date.now()
    const hit = cache.get(token)
    if (hit && hit.until > now) return { email: hit.email }
    const user = await getUser!(token)
    const email = user?.email?.trim().toLowerCase()
    if (!email || email !== allowed) throw unauthorized()
    if (cache.size >= CACHE_MAX) for (const [k, v] of cache) if (v.until <= now || cache.size >= CACHE_MAX) cache.delete(k)
    cache.set(token, { email, until: now + CACHE_MS })
    return { email }
  }
}
