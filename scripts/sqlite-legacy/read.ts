/**
 * Reads the desktop app's SQLite database (schema v7) as a Dataset. The original file is only
 * read: a `VACUUM INTO` copy is made in a temporary folder and that copy is opened read-only.
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import type { Row } from '../../src/server/db/db'
import { AppError } from '../../src/server/lib/errors'
import { TABLES_IN_ORDER, keyOf, type Dataset } from '../../src/server/services/dataset'

/** SQLite user_version 7 (desktop v2) is the same data model as Postgres schema v1. */
export const LEGACY_USER_VERSION = 7
const PG_SCHEMA_VERSION = 1

export function readSqliteDataset(file: string): Dataset {
  const dir = mkdtempSync(join(tmpdir(), 'pth-import-'))
  try {
    const copy = join(dir, 'hub-copy.db')
    const src = new Database(file, { readonly: true, fileMustExist: true })
    try {
      src.prepare('VACUUM INTO ?').run(copy)
    } finally {
      src.close()
    }
    const db = new Database(copy, { readonly: true, fileMustExist: true })
    try {
      const version = db.pragma('user_version', { simple: true }) as number
      if (version !== LEGACY_USER_VERSION) {
        throw new AppError('VALIDATION', `Banco SQLite na versão ${version}; o importador exige a versão ${LEGACY_USER_VERSION}.`)
      }
      const fk = db.pragma('foreign_key_check') as { table: string; rowid: number; parent: string }[]
      if (fk.length) {
        const sample = fk.slice(0, 5).map((r) => `${r.table}#${r.rowid}→${r.parent}`).join(', ')
        throw new AppError('VALIDATION', `Banco SQLite com ${fk.length} referência(s) quebrada(s): ${sample}.`)
      }
      const tables: Record<string, Row[]> = {}
      const counts: Record<string, number> = {}
      for (const t of TABLES_IN_ORDER) {
        tables[t] = db.prepare(`SELECT * FROM "${t}" ORDER BY ${keyOf(t).map((k) => `"${k}"`).join(', ')}`).all() as Row[]
        counts[t] = tables[t].length
      }
      return {
        manifest: { app: 'personal-task-hub', schemaVersion: PG_SCHEMA_VERSION, createdAt: new Date().toISOString(), counts },
        tables
      }
    } finally {
      db.close()
    }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}
