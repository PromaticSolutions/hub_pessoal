import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export const DEV_AUTH = import.meta.env.VITE_DEV_AUTH === '1'

let client: SupabaseClient | null = null

/** Lazily created so tests and dev-auth mode never need the Supabase env vars. */
export function getSupabase(): SupabaseClient {
  if (!client) {
    const url = import.meta.env.VITE_SUPABASE_URL
    const key = import.meta.env.VITE_SUPABASE_ANON_KEY
    if (!url || !key) throw new Error('VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY não configurados.')
    client = createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true } })
  }
  return client
}

/** Current access token (refreshed by supabase-js when needed), or null without a session. */
export async function getAccessToken(): Promise<string | null> {
  if (DEV_AUTH) return null
  const { data } = await getSupabase().auth.getSession()
  return data.session?.access_token ?? null
}

let manualSignOut = false
export const wasManualSignOut = () => manualSignOut

export async function signIn(email: string, password: string): Promise<void> {
  const { error } = await getSupabase().auth.signInWithPassword({ email, password })
  if (error) throw error
  manualSignOut = false
}

export async function signOut(): Promise<void> {
  manualSignOut = true
  await getSupabase().auth.signOut()
}
