import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, statSync, utimesSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import type Database from 'better-sqlite3'
import type { Attachment } from '@shared/types'
import type { DataPaths } from '../paths'
import type { AppContext } from '../context'
import { AppError } from '../lib/errors'
import { camel, must } from '../lib/rows'
import { logActivity } from '../lib/activity'

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

/* ---------- storage & queries ---------- */

const MIME: Record<string, string> = {
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

function sanitize(name: string): string {
  // eslint-disable-next-line no-control-regex
  let n = name.replace(/[/\\\x00-\x1f]/g, '_').trim() || 'arquivo'
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
  projectId: number
  projectName: string
  companyId: number
  companyName: string
  companyColor: string
}

export function addAttachments(ctx: AppContext, input: { taskId?: number; projectId?: number; sourcePaths: string[] }): Attachment[] {
  if ((input.taskId == null) === (input.projectId == null)) throw new AppError('VALIDATION', 'Informe a tarefa ou o projeto do anexo.')
  const now = ctx.now()
  const sub = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}`
  const out: Attachment[] = []
  for (const src of input.sourcePaths) {
    if (!existsSync(src) || !statSync(src).isFile()) throw new AppError('NOT_FOUND', `Arquivo não encontrado: ${basename(src)}`)
    const original = basename(src)
    const rel = `${sub}/${randomUUID()}-${sanitize(original)}`
    const dest = join(paths(ctx).attachments, rel)
    mkdirSync(dirname(dest), { recursive: true })
    const tmp = `${dest}.part`
    copyFileSync(src, tmp)
    renameSync(tmp, dest)
    const size = statSync(dest).size
    const ext = original.split('.').pop()?.toLowerCase() ?? ''
    const mime = MIME[ext] ?? 'application/octet-stream'
    const id = ctx.db
      .prepare('INSERT INTO attachments(task_id, project_id, original_name, stored_path, mime_type, size_bytes) VALUES (?, ?, ?, ?, ?, ?)')
      .run(input.taskId ?? null, input.projectId ?? null, original, rel, mime, size).lastInsertRowid as number
    if (input.taskId != null) logActivity(ctx.db, { entityType: 'task', entityId: input.taskId, taskId: input.taskId, action: 'attachment_added', newValue: original })
    out.push(getAttachment(ctx, id))
  }
  return out
}

const paths = (ctx: AppContext) => ctx.paths

export function getAttachment(ctx: AppContext, id: number): Attachment {
  return camel<Attachment>(must(ctx.db.prepare('SELECT * FROM attachments WHERE id = ?').get(id) as Record<string, unknown>, 'Anexo'))
}

export function getAttachmentAbsPath(ctx: AppContext, id: number): string {
  const a = getAttachment(ctx, id)
  const abs = join(ctx.paths.attachments, a.storedPath)
  if (!existsSync(abs)) throw new AppError('NOT_FOUND', 'Arquivo indisponível.')
  return abs
}

export function listAttachments(
  ctx: AppContext,
  f: { companyId?: number; projectId?: number; taskId?: number; kind?: AttachmentKind; text?: string; includeArchived?: boolean }
): AttachmentListItem[] {
  const where: string[] = []
  const params: unknown[] = []
  if (f.companyId) { where.push('co.id = ?'); params.push(f.companyId) }
  if (f.projectId) { where.push('p.id = ?'); params.push(f.projectId) }
  if (f.taskId) { where.push('a.task_id = ?'); params.push(f.taskId) }
  if (f.text?.trim()) { where.push('a.original_name LIKE ?'); params.push(`%${f.text.trim()}%`) }
  if (!f.includeArchived) where.push("(t.id IS NULL OR t.archived_at IS NULL) AND (b.id IS NULL OR b.archived_at IS NULL) AND p.archived_at IS NULL AND co.status = 'active'")
  const rows = ctx.db
    .prepare(
      `SELECT a.*, t.title AS task_title, p.id AS project_id_r, p.name AS project_name, co.id AS company_id, co.name AS company_name, co.color AS company_color
       FROM attachments a
       LEFT JOIN tasks t ON t.id = a.task_id
       LEFT JOIN boards b ON b.id = t.board_id
       JOIN projects p ON p.id = coalesce(a.project_id, b.project_id)
       JOIN companies co ON co.id = p.company_id
       ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
       ORDER BY a.created_at DESC, a.id DESC`
    )
    .all(...params) as Record<string, unknown>[]
  const items = rows.map((r) => {
    const x = camel<AttachmentListItem & { projectIdR: number }>(r)
    const item = { ...x, projectId: x.projectIdR, kind: kindOf(x.originalName, x.mimeType) } as AttachmentListItem & { projectIdR?: number }
    delete item.projectIdR
    return item as AttachmentListItem
  })
  return f.kind ? items.filter((i) => i.kind === f.kind) : items
}

export function deleteAttachment(ctx: AppContext, id: number): void {
  const a = getAttachment(ctx, id)
  ctx.db.prepare('DELETE FROM attachments WHERE id = ?').run(id)
  if (a.taskId != null) logActivity(ctx.db, { entityType: 'task', entityId: a.taskId, taskId: a.taskId, action: 'attachment_removed', oldValue: a.originalName })
  moveToDeleted(ctx.paths, a.storedPath)
}

export function getAttachmentDataUrl(ctx: AppContext, id: number, maxBytes = 5_000_000): string | null {
  const a = getAttachment(ctx, id)
  if (!a.mimeType.startsWith('image/') || a.sizeBytes > maxBytes) return null
  const abs = join(ctx.paths.attachments, a.storedPath)
  if (!existsSync(abs)) return null
  return `data:${a.mimeType};base64,${readFileSync(abs).toString('base64')}`
}

/** Brings back files referenced by the DB that only exist in attachments-deleted/ (after a restore). */
export function restoreMissingAttachments(p: DataPaths, db: Database.Database): { restored: number; missing: number } {
  let restored = 0
  let missing = 0
  for (const { stored_path } of db.prepare('SELECT stored_path FROM attachments').all() as { stored_path: string }[]) {
    const live = join(p.attachments, stored_path)
    if (existsSync(live)) continue
    const del = join(p.attachmentsDeleted, stored_path)
    if (existsSync(del)) {
      mkdirSync(dirname(live), { recursive: true })
      renameSync(del, live)
      restored++
    } else missing++
  }
  return { restored, missing }
}
