import type Database from 'better-sqlite3'
import { SETTINGS_DEFAULTS } from '@shared/constants'

export function getSetting<T>(db: Database.Database, key: string, fallback: T): T {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined
  if (!row) return fallback
  try {
    return JSON.parse(row.value) as T
  } catch {
    return fallback
  }
}

export function setSetting(db: Database.Database, key: string, value: unknown): void {
  db.prepare('INSERT INTO settings(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(
    key,
    JSON.stringify(value ?? null)
  )
}

export function getAllSettings(db: Database.Database): Record<string, unknown> {
  const out: Record<string, unknown> = { ...SETTINGS_DEFAULTS }
  for (const r of db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[]) {
    try {
      out[r.key] = JSON.parse(r.value)
    } catch {
      /* skip corrupt value */
    }
  }
  return out
}
