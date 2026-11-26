// Production context: Postgres (Supabase pooler) + Supabase Storage. Never loads PGlite or local Storage.
import type { AppContext } from './context'
import { createPgDb } from './db/pg'
import { createSupabaseStorage } from './storage/supabase'

export type ProdEnv = Record<string, string | undefined>

const REQUIRED = ['DATABASE_URL', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'ALLOWED_EMAIL'] as const

/** True when a flag variable is set to anything but empty/0/false. */
export const flagOn = (v: string | undefined) => !!v && !['0', 'false', 'no', 'off'].includes(v.trim().toLowerCase())

/** Throws (naming variables, never values) when the production configuration is unsafe or incomplete. */
export function checkProdEnv(env: ProdEnv): void {
  if (flagOn(env.HUB_DEV_AUTH)) throw new Error('HUB_DEV_AUTH não pode estar ligado em produção.')
  const missing = REQUIRED.filter((k) => !env[k]?.trim())
  if (missing.length) throw new Error(`Variáveis de ambiente ausentes: ${missing.join(', ')}.`)
}

let instance: Promise<AppContext> | undefined

/** One context per function instance (the pooled connection is reused across requests). */
export async function createProdContext(env: ProdEnv = process.env): Promise<AppContext> {
  checkProdEnv(env)
  instance ??= Promise.resolve().then(() => ({
    db: createPgDb(env.DATABASE_URL!),
    storage: createSupabaseStorage(env.SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!),
    now: () => new Date()
  }))
  return instance.catch((e) => {
    instance = undefined
    throw e
  })
}
