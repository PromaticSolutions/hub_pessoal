import { randomUUID } from 'node:crypto'
import type { Attachment, UploadRef } from '@shared/types'
import { MAX_FILE_BYTES } from '@shared/constants'
import { toLocalDate } from '@shared/dates'
import type { Db } from '../db/db'
import type { Storage } from '../storage/storage'
import type { AppContext } from '../context'
import { withTx } from '../db/tx'
import { checkKey } from '../storage/keys'
import { AppError } from '../lib/errors'
import { camel, insertId, must } from '../lib/rows'
import { logActivity } from '../lib/activity'

export const UPLOAD_PREFIX = 'uploads/tmp/'

/**
 * Moves a stored attachment file (`attachments/<rel>`) to `deleted/<YYYY-MM-DD>/<rel>` (today in
 * APP_TZ), so the 30-day purge reads the age from the key. Missing files are ignored.
 */
export async function moveToDeleted(ctx: Pick<AppContext, 'storage' | 'now'>, relPath: string): Promise<void> {
  try {
    await ctx.storage.move(`attachments/${relPath}`, `deleted/${toLocalDate(ctx.now())}/${relPath}`)
  } catch (e) {
    if (e instanceof AppError && e.code === 'NOT_FOUND') return
    throw e
  }
}

/** Stored paths of attachments matching a WHERE over `attachments a` joined to tasks/boards/projects. */
export async function collectAttachmentPaths(db: Db, where: string, params: unknown[]): Promise<string[]> {
  const rows = await db.many<{ stored_path: string }>(
    `SELECT a.stored_path FROM attachments a
     LEFT JOIN tasks t ON t.id = a.task_id
     LEFT JOIN boards b ON b.id = t.board_id
     LEFT JOIN projects p ON p.id = coalesce(a.project_id, b.project_id)
     WHERE ${where}`,
    params
  )
  return rows.map((r) => r.stored_path)
}

/* ---------- storage & queries ---------- */

export const MIME: Record<string, string> = {
  pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml',
  bmp: 'image/bmp', txt: 'text/plain', md: 'text/markdown', csv: 'text/csv', json: 'application/json', zip: 'application/zip',
  doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  odt: 'application/vnd.oasis.opendocument.text', ods: 'application/vnd.oasis.opendocument.spreadsheet',
  mp4: 'video/mp4', mp3: 'audio/mpeg'
}
const DOC_EXT = new Set(['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'odt', 'ods', 'txt', 'md', 'csv', 'rtf'])

export type AttachmentKind = 'image' | 'pdf' | 'document' | 'other'

export function kindOf(name: string, mime: string): AttachmentKind {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  if (mime.startsWith('image/')) return 'image'
  if (mime === 'application/pdf') return 'pdf'
  if (DOC_EXT.has(ext)) return 'document'
  return 'other'
}

export function sanitize(name: string): string {
  // eslint-disable-next-line no-control-regex
  let n = name.replace(/[/\\\x00-\x1f]/g, '_').trim() || 'arquivo'
  if (n === '.' || n === '..') n = 'arquivo'
  if (n.length > 120) {
    const dot = n.lastIndexOf('.')
    const ext = dot > 0 && n.length - dot <= 10 ? n.slice(dot) : ''
    n = n.slice(0, 120 - ext.length) + ext
  }
  return n
}

export type AttachmentListItem = Attachment & {
  kind: AttachmentKind
  taskTitle: string | null
  ideaTitle: string | null
  projectId: number | null
  projectName: string | null
  companyId: number | null
  companyName: string | null
  companyColor: string | null
}

export async function listAttachments(
  ctx: AppContext,
  f: { companyId?: number; projectId?: number; taskId?: number; ideaId?: number; kind?: AttachmentKind; text?: string; includeArchived?: boolean }
): Promise<AttachmentListItem[]> {
  const where: string[] = []
  const params: unknown[] = []
  if (f.companyId) { where.push('co.id = ?'); params.push(f.companyId) }
  if (f.projectId) { where.push('p.id = ?'); params.push(f.projectId) }
  if (f.taskId) { where.push('a.task_id = ?'); params.push(f.taskId) }
  if (f.ideaId) { where.push('a.idea_id = ?'); params.push(f.ideaId) }
  if (f.text?.trim()) { where.push('a.original_name ILIKE ?'); params.push(`%${f.text.trim()}%`) }
  if (!f.includeArchived) where.push("(t.id IS NULL OR t.archived_at IS NULL) AND (b.id IS NULL OR b.archived_at IS NULL) AND (p.id IS NULL OR p.archived_at IS NULL) AND (co.id IS NULL OR co.status = 'active')")
  const rows = await ctx.db.many<Record<string, unknown>>(
      `SELECT a.*, t.title AS task_title, i.title AS idea_title, p.id AS project_id_r, p.name AS project_name, co.id AS company_id, co.name AS company_name, co.color AS company_color
       FROM attachments a
       LEFT JOIN tasks t ON t.id = a.task_id
       LEFT JOIN ideas i ON i.id = a.idea_id
       LEFT JOIN boards b ON b.id = t.board_id
       LEFT JOIN projects p ON p.id = coalesce(a.project_id, b.project_id)
       LEFT JOIN companies co ON co.id = p.company_id
       ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
       ORDER BY a.created_at DESC, a.id DESC`,
    params
  )
  const items = rows.map((r) => {
    const x = camel<AttachmentListItem & { projectIdR: number }>(r)
    const item = { ...x, projectId: x.projectIdR, kind: kindOf(x.originalName, x.mimeType) } as AttachmentListItem & { projectIdR?: number }
    delete item.projectIdR
    return item as AttachmentListItem
  })
  return f.kind ? items.filter((i) => i.kind === f.kind) : items
}

export async function getAttachment(ctx: AppContext, id: number): Promise<Attachment> {
  return camel<Attachment>(must(await ctx.db.one('SELECT * FROM attachments WHERE id = ?', [id]), 'Anexo'))
}

/** Storage key for a browser upload: `uploads/tmp/<uuid>/<sanitized name>`. */
export function newUploadKey(name: string): string {
  return `${UPLOAD_PREFIX}${randomUUID()}/${sanitize(name)}`
}

/** Validates an upload key (must live under uploads/tmp/) and returns its real size in Storage. */
export async function checkUpload(storage: Storage, up: UploadRef): Promise<number> {
  checkKey(up.key)
  if (!up.key.startsWith(UPLOAD_PREFIX)) throw new AppError('VALIDATION', 'Arquivo enviado inválido.')
  const found = (await storage.list(up.key)).find((f) => f.key === up.key)
  if (!found) throw new AppError('NOT_FOUND', `Arquivo não encontrado: ${up.name}`)
  if (found.size > MAX_FILE_BYTES) throw new AppError('VALIDATION', `Arquivo maior que 50 MB: ${up.name}`)
  return found.size
}

const monthDir = (now: Date) => `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}`

/** Moves uploaded files from uploads/tmp/ to attachments/<YYYY>/<MM>/<uuid>-<name> and records them. */
export async function addAttachments(
  ctx: AppContext,
  input: { taskId?: number; projectId?: number; ideaId?: number; uploads: UploadRef[] }
): Promise<Attachment[]> {
  if ([input.taskId, input.projectId, input.ideaId].filter((x) => x != null).length !== 1) throw new AppError('VALIDATION', 'Informe a tarefa, o projeto ou a ideia do anexo.')
  const sub = monthDir(ctx.now())
  const files: { up: UploadRef; size: number; rel: string }[] = []
  for (const up of input.uploads) {
    const size = await checkUpload(ctx.storage, up)
    files.push({ up, size, rel: `${sub}/${randomUUID()}-${sanitize(up.name)}` })
  }
  const moved: typeof files = []
  try {
    for (const f of files) {
      await ctx.storage.move(f.up.key, `attachments/${f.rel}`)
      moved.push(f)
    }
    const ids = await withTx(ctx, async (tx) => {
      const out: number[] = []
      for (const { up, size, rel } of files) {
        const original = up.name.trim() || 'arquivo'
        const ext = original.split('.').pop()?.toLowerCase() ?? ''
        const mime = MIME[ext] ?? (up.mime || 'application/octet-stream')
        out.push(
          await insertId(tx.db, 'INSERT INTO attachments(task_id, project_id, idea_id, original_name, stored_path, mime_type, size_bytes) VALUES (?, ?, ?, ?, ?, ?, ?)', [
            input.taskId ?? null,
            input.projectId ?? null,
            input.ideaId ?? null,
            original,
            rel,
            mime,
            size
          ])
        )
        if (input.taskId != null) await logActivity(tx.db, { entityType: 'task', entityId: input.taskId, taskId: input.taskId, action: 'attachment_added', newValue: original })
      }
      return out
    })
    const out: Attachment[] = []
    for (const id of ids) out.push(await getAttachment(ctx, id))
    return out
  } catch (e) {
    // Put the files back where the browser left them, so nothing is lost or orphaned.
    for (const f of moved) await ctx.storage.move(`attachments/${f.rel}`, f.up.key).catch(() => undefined)
    throw e
  }
}

/** Signed URL (1 h) of the attachment; `download` makes the browser save it with its original name. */
export async function getAttachmentUrl(ctx: AppContext, id: number, opts: { download?: boolean } = {}): Promise<string> {
  const a = await getAttachment(ctx, id)
  const key = `attachments/${a.storedPath}`
  if (!(await ctx.storage.exists(key))) throw new AppError('NOT_FOUND', 'Arquivo indisponível.')
  return ctx.storage.signedUrl(key, opts.download ? { downloadName: a.originalName } : undefined)
}

export async function deleteAttachment(ctx: AppContext, id: number): Promise<void> {
  const a = await getAttachment(ctx, id)
  await withTx(ctx, async (tx) => {
    await tx.db.run('DELETE FROM attachments WHERE id = ?', [id])
    if (a.taskId != null) await logActivity(tx.db, { entityType: 'task', entityId: a.taskId, taskId: a.taskId, action: 'attachment_removed', oldValue: a.originalName })
  })
  await moveToDeleted(ctx, a.storedPath)
}

/** Brings back files referenced by the DB that only exist under deleted/<date>/ (after a restore). */
export async function restoreMissingAttachments(storage: Storage, db: Db): Promise<{ restored: number; missing: number }> {
  const rows = await db.many<{ stored_path: string }>('SELECT stored_path FROM attachments')
  if (!rows.length) return { restored: 0, missing: 0 }
  const live = new Set((await storage.list('attachments/')).map((f) => f.key.slice('attachments/'.length)))
  const deleted = new Map<string, string>() // rel → newest deleted key
  for (const f of await storage.list('deleted/')) {
    const m = /^deleted\/\d{4}-\d{2}-\d{2}\/(.+)$/.exec(f.key)
    if (m) deleted.set(m[1], f.key) // list is sorted by key, so later dates win
  }
  let restored = 0
  let missing = 0
  for (const { stored_path } of rows) {
    if (live.has(stored_path)) continue
    const from = deleted.get(stored_path)
    if (from) {
      await storage.move(from, `attachments/${stored_path}`)
      deleted.delete(stored_path)
      live.add(stored_path)
      restored++
    } else missing++
  }
  return { restored, missing }
}
