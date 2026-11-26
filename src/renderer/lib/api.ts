import type { ApiMethods, Envelope } from '@shared/api'
import { getAccessToken } from './supabase'

export class ApiError extends Error {
  constructor(public code: string, message: string) {
    super(message)
  }
}

export type Method = keyof ApiMethods
export type In<K extends Method> = ApiMethods[K]['input']
export type Out<K extends Method> = ApiMethods[K]['output']

export const UNAUTHORIZED_EVENT = 'hub:unauthorized'
const EXPIRED = 'Sessão expirada. Entre novamente.'

function unauthorized(message?: string): ApiError {
  globalThis.window?.dispatchEvent(new Event(UNAUTHORIZED_EVENT))
  return new ApiError('UNAUTHORIZED', message || EXPIRED)
}

export async function api<K extends Method>(method: K, input: In<K>): Promise<Out<K>> {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (import.meta.env.VITE_DEV_AUTH !== '1') {
    const token = await getAccessToken().catch(() => null)
    if (token) headers.authorization = `Bearer ${token}`
  }
  const body = JSON.stringify({ method, input })
  // Saves sent while the page is hidden/closing (flush on pagehide) must outlive the page.
  const keepalive = globalThis.document?.visibilityState === 'hidden' && body.length < 60_000
  let res: Response
  try {
    res = await fetch('/api/rpc', { method: 'POST', headers, body, ...(keepalive ? { keepalive } : {}) })
  } catch {
    throw new ApiError('NETWORK', 'Sem conexão com o servidor. Verifique a internet e tente novamente.')
  }
  let env: Envelope | null = null
  try {
    env = (await res.json()) as Envelope
  } catch {
    env = null
  }
  if (res.status === 401) throw unauthorized(env && !env.ok ? env.error.message : undefined)
  if (!env || typeof env !== 'object' || !('ok' in env)) throw new ApiError('INTERNAL', `Erro do servidor (${res.status}).`)
  if (!env.ok) {
    if (env.error.code === 'UNAUTHORIZED') throw unauthorized(env.error.message)
    throw new ApiError(env.error.code, env.error.message)
  }
  return env.data as Out<K>
}
