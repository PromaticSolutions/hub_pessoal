import { existsSync, mkdirSync, renameSync, utimesSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type Database from 'better-sqlite3'
import type { DataPaths } from '../paths'

/** Moves a stored attachment file to attachments-deleted/ (kept 30 days). Missing files are ignored. */
export function moveToDeleted(paths: DataPaths, relPath: string): void {
  const src = join(paths.attachments, relPath)
  if (!existsSync(src)) return
  const dest = join(paths.attachmentsDeleted, relPath)
  mkdirSync(dirname(dest), { recursive: true })
  renameSync(src, dest)
  const now = new Date()
  utimesSync(dest, now, now)
}

/** Stored paths of attachments matching a WHERE over `attachments a` joined to tasks/boards/projects. */
export function collectAttachmentPaths(db: Database.Database, where: string, params: unknown[]): string[] {
  const rows = db
    .prepare(
      `SELECT a.stored_path FROM attachments a
       LEFT JOIN tasks t ON t.id = a.task_id
       LEFT JOIN boards b ON b.id = t.board_id
       LEFT JOIN projects p ON p.id = coalesce(a.project_id, b.project_id)
       WHERE ${where}`
    )
    .all(...params) as { stored_path: string }[]
  return rows.map((r) => r.stored_path)
}
