import { join } from 'node:path'
import type Database from 'better-sqlite3'
import { AppError } from '../lib/errors'
import { migrations as defaultMigrations, type Migration } from './migrations'
import { fileStamp, vacuumInto } from './sqlutil'

export const LATEST_SCHEMA_VERSION = defaultMigrations[defaultMigrations.length - 1].version

export function runMigrations(
  db: Database.Database,
  opts: { preMigrationDir?: string; now?: Date; migrations?: Migration[] }
): { from: number; to: number } {
  const list = opts.migrations ?? defaultMigrations
  const latest = list[list.length - 1].version
  const from = db.pragma('user_version', { simple: true }) as number
  if (from > latest) {
    throw new AppError('SCHEMA_TOO_NEW', 'Este banco de dados foi criado por uma versão mais nova do aplicativo.')
  }
  if (from === latest) return { from, to: from }
  if (from > 0 && opts.preMigrationDir) {
    vacuumInto(db, join(opts.preMigrationDir, `hub-v${from}-${fileStamp(opts.now)}.db`))
  }
  for (const m of list) {
    if (m.version <= from) continue
    db.transaction(() => {
      db.exec(m.sql)
      m.run?.(db)
      db.pragma(`user_version = ${m.version}`)
    })()
  }
  return { from, to: latest }
}
