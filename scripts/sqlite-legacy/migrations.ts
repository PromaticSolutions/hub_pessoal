/**
 * Legacy SQLite (desktop v2) migrations, kept only to build SQLite fixtures for the
 * import script tests (Task 9). Mirrors the former src/main/db/migrations/index.ts
 * and src/main/db/migrate.ts: each migration runs in a transaction and sets
 * PRAGMA user_version; 007 also seeds the "Geral" dashboard from TEMPLATES.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type Database from 'better-sqlite3'
import { TEMPLATES, scopeFromV1 } from '../../src/shared/widgets'

const dir = fileURLToPath(new URL('.', import.meta.url))
const sql = (f: string) => readFileSync(join(dir, f), 'utf8')

export type LegacyMigration = { version: number; name: string; sql: string; run?: (db: Database.Database) => void }

/** Seeds the "Geral" dashboard reproducing the v1 dashboard, keeping the scope chosen in v1. */
function seedDashboards(db: Database.Database) {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'dashboard.scope'").get() as { value: string } | undefined
  let v1: unknown = undefined
  try { v1 = row ? JSON.parse(row.value) : undefined } catch { /* ignore */ }
  const t = TEMPLATES.geral
  const id = db.prepare('INSERT INTO dashboards(name, scope, position) VALUES (?, ?, 1024)').run(t.name, JSON.stringify(scopeFromV1(v1))).lastInsertRowid
  const ins = db.prepare('INSERT INTO dashboard_widgets(dashboard_id, type, title, config, x, y, w, h) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
  for (const w of t.widgets) ins.run(id, w.type, w.title, JSON.stringify(w.config), w.x, w.y, w.w, w.h)
}

export const legacyMigrations: LegacyMigration[] = [
  { version: 1, name: 'initial', sql: sql('001_initial.sql') },
  { version: 2, name: 'folder_archive', sql: sql('002_folder_archive.sql') },
  { version: 3, name: 'colors', sql: sql('003_colors.sql') },
  { version: 4, name: 'day_blocks', sql: sql('004_day_blocks.sql') },
  { version: 5, name: 'ideas', sql: sql('005_ideas.sql') },
  { version: 6, name: 'shopping', sql: sql('006_shopping.sql') },
  { version: 7, name: 'dashboards', sql: sql('007_dashboards.sql'), run: seedDashboards }
]

/** Applies legacy migrations up to `upTo` (default 7) on an open better-sqlite3 database (foreign_keys = ON expected). */
export function runLegacyMigrations(db: Database.Database, upTo = 7): void {
  const from = db.pragma('user_version', { simple: true }) as number
  for (const m of legacyMigrations) {
    if (m.version <= from || m.version > upTo) continue
    db.transaction(() => {
      db.exec(m.sql)
      m.run?.(db)
      db.pragma(`user_version = ${m.version}`)
    })()
  }
}
