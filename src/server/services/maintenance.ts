import { AUTO_BACKUP_KEEP, DELETED_ATTACHMENT_DAYS, TMP_UPLOAD_HOURS } from '@shared/constants'
import { toLocalDate } from '@shared/dates'
import type { AppContext } from '../context'
import { UPLOAD_PREFIX } from './attachments'
import { createBackup, listAutoBackups, parseBackupKey } from './backup'

export { listAutoBackups } from './backup'

/** One automatic backup per local day; keeps the newest `keep`. Returns the new key, or null. */
export async function runDailyAutoBackup(ctx: AppContext, keep = AUTO_BACKUP_KEEP): Promise<string | null> {
  const today = toLocalDate(ctx.now())
  const autos = await listAutoBackups(ctx)
  if (autos.some((b) => parseBackupKey(b.key)?.date === today)) return null
  const { key } = await createBackup(ctx, 'auto')
  const old = (await listAutoBackups(ctx)).slice(keep).map((b) => b.key)
  if (old.length) await ctx.storage.remove(old)
  return key
}

/**
 * Removes files deleted more than `days` days ago. Keys are `deleted/<YYYY-MM-DD>/…` (deletion day);
 * a key without that date falls back to the object's `updatedAt`.
 */
export async function purgeDeletedAttachments(ctx: AppContext, days = DELETED_ATTACHMENT_DAYS): Promise<number> {
  const now = ctx.now()
  const limitDay = toLocalDate(new Date(now.getTime() - days * 86_400_000))
  const limitMs = now.getTime() - days * 86_400_000
  const old = (await ctx.storage.list('deleted/'))
    .filter((f) => {
      const day = /^deleted\/(\d{4}-\d{2}-\d{2})\//.exec(f.key)?.[1]
      return day ? day < limitDay : Date.parse(f.updatedAt) < limitMs
    })
    .map((f) => f.key)
  if (old.length) await ctx.storage.remove(old)
  return old.length
}

/** Removes browser uploads that were never attached (older than `hours`). */
export async function purgeTmpUploads(ctx: AppContext, hours = TMP_UPLOAD_HOURS): Promise<number> {
  const limit = ctx.now().getTime() - hours * 3_600_000
  const old = (await ctx.storage.list(UPLOAD_PREFIX)).filter((f) => Date.parse(f.updatedAt) < limit).map((f) => f.key)
  if (old.length) await ctx.storage.remove(old)
  return old.length
}

/** Daily cron: automatic backup (if none today, keeps 30), purge of deleted/ (> 30 days) and uploads/tmp/ (> 1 day). */
export async function runDailyMaintenance(ctx: AppContext): Promise<{ backup: string | null; purged: number }> {
  const backup = await runDailyAutoBackup(ctx)
  const purged = (await purgeDeletedAttachments(ctx)) + (await purgeTmpUploads(ctx))
  return { backup, purged }
}
