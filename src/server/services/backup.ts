import { gunzipSync, gzipSync } from 'node:zlib'
import type { AppContext } from '../context'
import { AppError } from '../lib/errors'
import { LATEST_SCHEMA_VERSION } from '../db/migrate'
import { checkKey } from '../storage/keys'
import { exportDataset, importDataset, type Dataset } from './dataset'
import { UPLOAD_PREFIX, restoreMissingAttachments } from './attachments'

export type BackupKind = 'manual' | 'auto'
export type BackupManifest = Dataset['manifest']

export const AUTO_PREFIX = 'backups/auto/'
const BACKUP_FILE = /^hub-(\d{4})-(\d{2})-(\d{2})_(\d{2})(\d{2})(\d{2})\.json\.gz$/

/** Local-time stamp used in backup file names: `YYYY-MM-DD_HHMMSS`. */
export function fileStamp(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
}

/** Local date (`YYYY-MM-DD`) and creation time of a backup key, or null when the name is not ours. */
export function parseBackupKey(key: string): { date: string; createdAt: string } | null {
  const m = BACKUP_FILE.exec(key.slice(key.lastIndexOf('/') + 1))
  if (!m) return null
  const [, y, mo, d, h, mi, s] = m.map(Number)
  return { date: `${m[1]}-${m[2]}-${m[3]}`, createdAt: new Date(y, mo - 1, d, h, mi, s).toISOString() }
}

/** Exports every table as gzipped JSON to `backups/<kind>/hub-<stamp>.json.gz`. */
export async function createBackup(ctx: AppContext, kind: BackupKind): Promise<{ key: string; manifest: BackupManifest }> {
  const now = ctx.now()
  const ds = await exportDataset(ctx.db, now)
  const key = `backups/${kind}/hub-${fileStamp(now)}.json.gz`
  await ctx.storage.put(key, gzipSync(Buffer.from(JSON.stringify(ds)), { level: 6 }), 'application/gzip')
  return { key, manifest: ds.manifest }
}

function invalid(msg: string): never {
  throw new AppError('INVALID_BACKUP', msg)
}

/** Backups may be read from the backup folders or from a browser upload. */
function checkBackupKey(key: string): void {
  checkKey(key)
  if (!key.startsWith('backups/') && !key.startsWith(UPLOAD_PREFIX)) throw new AppError('VALIDATION', 'Arquivo de backup inválido.')
}

/** Reads and validates a backup (gzipped or plain JSON). Current data is never touched. */
async function readBackup(ctx: AppContext, key: string): Promise<Dataset> {
  checkBackupKey(key)
  let raw: Uint8Array
  try {
    raw = await ctx.storage.get(key)
  } catch (e) {
    if (e instanceof AppError && e.code === 'NOT_FOUND') invalid('Arquivo de backup não encontrado.')
    throw e
  }
  let text: string
  try {
    text = (raw[0] === 0x1f && raw[1] === 0x8b ? gunzipSync(raw) : Buffer.from(raw)).toString('utf8')
  } catch {
    invalid('O arquivo de backup está corrompido ou não pôde ser aberto.')
  }
  let ds: Dataset
  try {
    ds = JSON.parse(text) as Dataset
  } catch {
    invalid('O arquivo não é um backup do Personal Task Hub (JSON inválido).')
  }
  const m = ds?.manifest
  if (!m || typeof m !== 'object') invalid('O backup não contém manifesto — não é um backup do Personal Task Hub.')
  if (m.app !== 'personal-task-hub') invalid('Este backup não pertence ao Personal Task Hub.')
  if (typeof m.schemaVersion !== 'number' || m.schemaVersion < 1) invalid('Versão de dados do backup inválida.')
  if (m.schemaVersion > LATEST_SCHEMA_VERSION) invalid('Este backup foi criado por uma versão mais nova do aplicativo.')
  if (!ds.tables || typeof ds.tables !== 'object' || Array.isArray(ds.tables)) invalid('O backup não contém os dados.')
  for (const [t, rows] of Object.entries(ds.tables)) if (!Array.isArray(rows)) invalid(`Tabela ${t} inválida no backup.`)
  return ds
}

/** Validates a backup and returns its manifest, with counts taken from the actual rows. */
export async function inspectBackup(ctx: AppContext, key: string): Promise<BackupManifest> {
  return manifestOf(await readBackup(ctx, key))
}

function manifestOf(ds: Dataset): BackupManifest {
  return { ...ds.manifest, counts: Object.fromEntries(Object.entries(ds.tables).map(([t, rows]) => [t, rows.length])) }
}

/**
 * Replaces every table with the backup's rows (one transaction: on failure nothing changes).
 * An automatic backup of the current data is made first. Attachment files are kept in Storage;
 * those the restored rows need that were deleted meanwhile come back from deleted/.
 */
export async function restoreBackup(ctx: AppContext, key: string): Promise<{ manifest: BackupManifest; safetyBackup: string }> {
  const ds = await readBackup(ctx, key)
  const safety = await createBackup(ctx, 'auto')
  try {
    await importDataset(ctx.db, ds, { replace: true })
  } catch (e) {
    if (e instanceof AppError) throw e
    throw new AppError('INVALID_BACKUP', `Falha ao restaurar; os dados atuais foram mantidos. (${(e as Error).message})`)
  }
  await restoreMissingAttachments(ctx.storage, ctx.db)
  if (key.startsWith(UPLOAD_PREFIX)) await ctx.storage.remove([key])
  return { manifest: manifestOf(ds), safetyBackup: safety.key }
}

/** Automatic backups, newest first. */
export async function listAutoBackups(ctx: AppContext): Promise<{ key: string; createdAt: string; size: number }[]> {
  const out: { key: string; createdAt: string; size: number }[] = []
  for (const f of await ctx.storage.list(AUTO_PREFIX)) {
    const p = parseBackupKey(f.key)
    if (p && f.key.lastIndexOf('/') === AUTO_PREFIX.length - 1) out.push({ key: f.key, createdAt: p.createdAt, size: f.size })
  }
  return out.sort((a, b) => (a.key < b.key ? 1 : a.key > b.key ? -1 : 0))
}
