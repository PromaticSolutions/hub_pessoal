import { copyFileSync, existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync } from 'node:fs'
import { join } from 'node:path'
import type Database from 'better-sqlite3'
import { AUTO_BACKUP_KEEP, DELETED_ATTACHMENT_DAYS } from '@shared/constants'
import { toLocalDate } from '@shared/dates'
import type { DataPaths } from '../paths'
import { fileStamp, vacuumInto } from '../db/sqlutil'
import { openDatabase } from '../db/connection'

export function quickCheck(db: Database.Database): boolean {
  try {
    return db.pragma('quick_check', { simple: true }) === 'ok'
  } catch {
    return false
  }
}

export function listAutoBackups(paths: DataPaths): { file: string; date: string; sizeBytes: number }[] {
  if (!existsSync(paths.backupsAuto)) return []
  return readdirSync(paths.backupsAuto)
    .filter((f) => /^hub-\d{4}-\d{2}-\d{2}\.db$/.test(f))
    .sort()
    .reverse()
    .map((f) => ({ file: join(paths.backupsAuto, f), date: f.slice(4, 14), sizeBytes: statSync(join(paths.backupsAuto, f)).size }))
}

export function runDailyAutoBackup(db: Database.Database, paths: DataPaths, now: Date, keep = AUTO_BACKUP_KEEP): string | null {
  const file = join(paths.backupsAuto, `hub-${toLocalDate(now)}.db`)
  if (existsSync(file)) return null
  vacuumInto(db, file)
  for (const old of listAutoBackups(paths).slice(keep)) rmSync(old.file, { force: true })
  return file
}

export function purgeDeletedAttachments(paths: DataPaths, now: Date, days = DELETED_ATTACHMENT_DAYS): number {
  if (!existsSync(paths.attachmentsDeleted)) return 0
  const limit = now.getTime() - days * 86_400_000
  let removed = 0
  const walk = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name)
      if (e.isDirectory()) walk(p)
      else if (statSync(p).mtimeMs < limit) {
        rmSync(p, { force: true })
        removed++
      }
    }
  }
  walk(paths.attachmentsDeleted)
  return removed
}

export function closeDatabase(db: Database.Database): void {
  if (!db.open) return
  try {
    db.pragma('wal_checkpoint(TRUNCATE)')
  } finally {
    db.close()
  }
}

/**
 * Corruption recovery: moves the current DB files to backups/pre-restore/corrupted-<stamp>/ and
 * restores the newest automatic backup that passes quick_check. Returns the open DB, or null.
 */
export function recoverFromAutoBackups(paths: DataPaths): Database.Database | null {
  const aside = join(paths.backupsPreRestore, `corrupted-${fileStamp()}`)
  mkdirSync(aside, { recursive: true })
  for (const suffix of ['', '-wal', '-shm']) {
    const f = paths.dbFile + suffix
    if (existsSync(f)) renameSync(f, join(aside, `hub.db${suffix}`))
  }
  for (const b of listAutoBackups(paths)) {
    let db: Database.Database | null = null
    try {
      copyFileSync(b.file, paths.dbFile)
      db = openDatabase(paths.dbFile)
      if (quickCheck(db)) return db
    } catch {
      /* try the next one */
    }
    try { db?.close() } catch { /* ignore */ }
    for (const suffix of ['', '-wal', '-shm']) rmSync(paths.dbFile + suffix, { force: true })
  }
  return null
}
