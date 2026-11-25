import { mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

export type DataPaths = {
  root: string
  dbFile: string
  attachments: string
  attachmentsDeleted: string
  logos: string
  backupsAuto: string
  backupsPreMigration: string
  backupsPreRestore: string
  restoreStaging: string
  logs: string
}

export function getDataRoot(isPackaged: boolean): string {
  if (process.env.PTH_DATA_DIR) return process.env.PTH_DATA_DIR
  const base = process.env.XDG_DATA_HOME || join(homedir(), '.local', 'share')
  return join(base, isPackaged ? 'personal-task-hub' : 'personal-task-hub-dev')
}

export function resolveDataPaths(root: string): DataPaths {
  return {
    root,
    dbFile: join(root, 'hub.db'),
    attachments: join(root, 'attachments'),
    attachmentsDeleted: join(root, 'attachments-deleted'),
    logos: join(root, 'logos'),
    backupsAuto: join(root, 'backups', 'auto'),
    backupsPreMigration: join(root, 'backups', 'pre-migration'),
    backupsPreRestore: join(root, 'backups', 'pre-restore'),
    restoreStaging: join(root, 'restore-staging'),
    logs: join(root, 'logs')
  }
}

export function ensureDataDirs(p: DataPaths): void {
  for (const [k, v] of Object.entries(p)) {
    if (k === 'dbFile') continue
    mkdirSync(v, { recursive: true })
  }
}
