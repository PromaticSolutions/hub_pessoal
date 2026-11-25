import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type Database from 'better-sqlite3'
import { resolveDataPaths, ensureDataDirs, type DataPaths } from '@main/paths'
import { openDatabase } from '@main/db/connection'
import { runMigrations } from '@main/db/migrate'

export function createTestDb(): { db: Database.Database; paths: DataPaths; cleanup(): void } {
  const root = mkdtempSync(join(tmpdir(), 'pth-test-'))
  const paths = resolveDataPaths(root)
  ensureDataDirs(paths)
  const db = openDatabase(paths.dbFile)
  runMigrations(db, { preMigrationDir: paths.backupsPreMigration })
  return {
    db,
    paths,
    cleanup() {
      try { db.close() } catch { /* already closed */ }
      rmSync(root, { recursive: true, force: true })
    }
  }
}
