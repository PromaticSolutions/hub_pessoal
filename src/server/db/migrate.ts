import { TEMPLATES, scopeFromV1 } from '@shared/widgets'
import { AppError } from '../lib/errors'
import type { Db } from './db'
import initialSql from './schema/001_initial.sql?raw'
import reviewSql from './schema/002_review_category.sql?raw'

export type Migration = { version: number; name: string; sql: string }

/** Postgres schema v1 = SQLite schema v7 of the desktop app. */
export const migrations: Migration[] = [
  { version: 1, name: 'initial', sql: initialSql },
  { version: 2, name: 'review_category', sql: reviewSql }
]
export const LATEST_SCHEMA_VERSION = migrations[migrations.length - 1].version

// Serialises concurrent migrators (two deploys, script + dev server).
const MIGRATION_LOCK = 724_310_001

/**
 * Brings the schema to LATEST_SCHEMA_VERSION in one transaction. On a fresh install
 * (`from` = 0) it also seeds the fixed "Pessoal" space and the "Geral" dashboard,
 * unless `seed: false` (data import, which needs an empty database).
 */
export async function runMigrations(db: Db, opts: { seed?: boolean } = {}): Promise<{ from: number; to: number }> {
  return db.tx(async (t) => {
    await t.one('SELECT pg_advisory_xact_lock(?)', [MIGRATION_LOCK])
    await t.exec('CREATE TABLE IF NOT EXISTS schema_version (version integer NOT NULL)')
    const from = (await t.one<{ v: number | null }>('SELECT max(version) v FROM schema_version'))?.v ?? 0
    if (from > LATEST_SCHEMA_VERSION) {
      throw new AppError('SCHEMA_TOO_NEW', 'Este banco de dados foi criado por uma versão mais nova do aplicativo.')
    }
    if (from === LATEST_SCHEMA_VERSION) return { from, to: from }
    for (const m of migrations) {
      if (m.version <= from) continue
      await t.exec(m.sql)
    }
    await t.run('DELETE FROM schema_version')
    await t.run('INSERT INTO schema_version(version) VALUES (?)', [LATEST_SCHEMA_VERSION])
    if (from === 0 && opts.seed !== false) await seedDefaults(t)
    return { from, to: LATEST_SCHEMA_VERSION }
  })
}

/**
 * Fresh-install data, as SQLite 001 and 007 did: the fixed "Pessoal" space (if missing) and the
 * "Geral" dashboard (only when there is no dashboard). Run by runMigrations on a new database.
 */
export async function seedDefaults(db: Db): Promise<void> {
  if (!(await db.one('SELECT 1 FROM companies WHERE is_personal = 1'))) {
    await db.run("INSERT INTO companies(name, color, is_personal, position) VALUES ('Pessoal', '#6366F1', 1, 0)")
  }
  if (await db.one('SELECT 1 FROM dashboards LIMIT 1')) return
  const row = await db.one<{ value: string }>("SELECT value FROM settings WHERE key = 'dashboard.scope'")
  let v1: unknown = undefined
  try { v1 = row ? JSON.parse(row.value) : undefined } catch { /* ignore */ }
  const t = TEMPLATES.geral
  const id = (await db.one<{ id: number }>(
    'INSERT INTO dashboards(name, scope, position) VALUES (?, ?, 1024) RETURNING id',
    [t.name, JSON.stringify(scopeFromV1(v1))]
  ))!.id
  for (const w of t.widgets) {
    await db.run(
      'INSERT INTO dashboard_widgets(dashboard_id, type, title, config, x, y, w, h) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [id, w.type, w.title, JSON.stringify(w.config), w.x, w.y, w.w, w.h]
    )
  }
}

/** Sets every identity sequence in `public` to continue after max(id) (after imports with explicit ids). */
export async function syncSequences(db: Db): Promise<void> {
  const cols = await db.many<{ table_name: string; column_name: string }>(
    "SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public' AND is_identity = 'YES' ORDER BY table_name"
  )
  for (const { table_name: tbl, column_name: col } of cols) {
    const t = `"${tbl.replace(/"/g, '""')}"`
    const c = `"${col.replace(/"/g, '""')}"`
    await db.one(
      `SELECT setval(pg_get_serial_sequence(?, ?), coalesce((SELECT max(${c}) FROM ${t}), 0) + 1, false)`,
      [`public.${t}`, col]
    )
  }
}
