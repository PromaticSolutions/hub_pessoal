import type { Db } from '../db/db'
import { SETTINGS_DEFAULTS } from '@shared/constants'

export async function getSetting<T>(db: Db, key: string, fallback: T): Promise<T> {
  const row = await db.one<{ value: string }>('SELECT value FROM settings WHERE key = ?', [key])
  if (!row) return fallback
  try {
    return JSON.parse(row.value) as T
  } catch {
    return fallback
  }
}

export async function setSetting(db: Db, key: string, value: unknown): Promise<void> {
  await db.run('INSERT INTO settings(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', [
    key,
    JSON.stringify(value ?? null)
  ])
}

export async function getAllSettings(db: Db): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = { ...SETTINGS_DEFAULTS }
  for (const r of await db.many<{ key: string; value: string }>('SELECT key, value FROM settings')) {
    try {
      out[r.key] = JSON.parse(r.value)
    } catch {
      /* skip corrupt value */
    }
  }
  return out
}
