import type { Attachment } from '@shared/types'
import type { Db } from '../db/db'
import type { Storage } from '../storage/storage'
import type { AppContext } from '../context'
import { AppError } from '../lib/errors'
import { camel, must } from '../lib/rows'

/** Moves a stored attachment file (`attachments/<rel>`) to `deleted/<rel>` in Storage. Missing files are ignored. */
export async function moveToDeleted(storage: Storage, relPath: string): Promise<void> {
  try {
    await storage.move(`attachments/${relPath}`, `deleted/${relPath}`)
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

const pending = (): never => {
  throw new AppError('INTERNAL', 'pendente')
}

// Task 5: file storage functions below are ported with the Storage API.
export async function addAttachments(
  _ctx: AppContext,
  _input: { taskId?: number; projectId?: number; ideaId?: number; sourcePaths: string[]; originalNames?: string[] }
): Promise<Attachment[]> {
  return pending()
}

export async function getAttachmentAbsPath(_ctx: AppContext, _id: number): Promise<string> {
  return pending()
}

export async function deleteAttachment(_ctx: AppContext, _id: number): Promise<void> {
  return pending()
}

export async function getAttachmentDataUrl(_ctx: AppContext, _id: number, _maxBytes = 5_000_000): Promise<string | null> {
  return pending()
}

export async function restoreMissingAttachments(_storage: Storage, _db: Db): Promise<{ restored: number; missing: number }> {
  return pending()
}
