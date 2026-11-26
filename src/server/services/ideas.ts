import { join } from 'node:path'
import type { Attachment, Company, Idea, IdeaStatus, Label, Priority, Project, Task } from '@shared/types'
import type { AppContext } from '../context'
import { AppError } from '../lib/errors'
import { camel, camelAll, must, requireName } from '../lib/rows'
import { addAttachments, collectAttachmentPaths, moveToDeleted } from './attachments'
import { quickCreateTask } from './taskQuery'
import { setTaskLabels, updateTask } from './tasks'
import { createProject } from './projects'
import { getCompany } from './companies'

const TS = "strftime('%Y-%m-%dT%H:%M:%fZ','now')"
const STATUS_ORDER = "CASE i.status WHEN 'new' THEN 0 WHEN 'analysis' THEN 1 WHEN 'developing' THEN 2 WHEN 'implemented' THEN 3 ELSE 4 END"

export type IdeaListItem = Idea & { labels: Label[]; attachmentCount: number; companyName: string | null; companyColor: string | null; projectName: string | null }
export type IdeaDetail = Idea & { labels: Label[]; attachments: Attachment[]; company: Company | null; project: Project | null }
export type IdeaInput = Partial<{ description: string; category: string; priority: Priority; status: IdeaStatus; companyId: number | null; projectId: number | null }>

function row(ctx: AppContext, id: number): Idea {
  return camel<Idea>(must(ctx.db.prepare('SELECT * FROM ideas WHERE id = ?').get(id) as Record<string, unknown>, 'Ideia'))
}

function ideaLabels(ctx: AppContext, ids: number[]): Map<number, Label[]> {
  const m = new Map<number, Label[]>()
  if (!ids.length) return m
  const rows = ctx.db
    .prepare(`SELECT il.idea_id, l.id, l.name, l.color FROM idea_labels il JOIN labels l ON l.id = il.label_id WHERE il.idea_id IN (${ids.map(() => '?').join(',')}) ORDER BY l.name`)
    .all(...ids) as { idea_id: number; id: number; name: string; color: string }[]
  for (const r of rows) m.set(r.idea_id, [...(m.get(r.idea_id) ?? []), { id: r.id, name: r.name, color: r.color }])
  return m
}

function checkLinks(ctx: AppContext, companyId: number | null | undefined, projectId: number | null | undefined) {
  if (companyId != null) getCompany(ctx, companyId)
  if (projectId != null) {
    const p = ctx.db.prepare('SELECT company_id FROM projects WHERE id = ?').get(projectId) as { company_id: number } | undefined
    if (!p) throw new AppError('NOT_FOUND', 'Projeto não encontrado.')
    if (companyId != null && p.company_id !== companyId) throw new AppError('VALIDATION', 'O projeto escolhido pertence a outra empresa.')
  }
}

export function listIdeas(
  ctx: AppContext,
  f: { status?: IdeaStatus[]; category?: string; priority?: Priority; companyId?: number; labelId?: number; text?: string }
): IdeaListItem[] {
  const w: string[] = []
  const p: unknown[] = []
  if (f.status?.length) { w.push(`i.status IN (${f.status.map(() => '?').join(',')})`); p.push(...f.status) }
  if (f.category) { w.push('i.category = ?'); p.push(f.category) }
  if (f.priority) { w.push('i.priority = ?'); p.push(f.priority) }
  if (f.companyId) { w.push('i.company_id = ?'); p.push(f.companyId) }
  if (f.labelId) { w.push('EXISTS (SELECT 1 FROM idea_labels il WHERE il.idea_id = i.id AND il.label_id = ?)'); p.push(f.labelId) }
  if (f.text?.trim()) { w.push('(i.title LIKE ? OR i.description LIKE ?)'); p.push(`%${f.text.trim()}%`, `%${f.text.trim()}%`) }
  const rows = camelAll<IdeaListItem>(
    ctx.db
      .prepare(
        `SELECT i.*, co.name AS company_name, co.color AS company_color, pr.name AS project_name,
           (SELECT count(*) FROM attachments a WHERE a.idea_id = i.id) AS attachment_count
         FROM ideas i LEFT JOIN companies co ON co.id = i.company_id LEFT JOIN projects pr ON pr.id = i.project_id
         ${w.length ? `WHERE ${w.join(' AND ')}` : ''}
         ORDER BY ${STATUS_ORDER}, i.position, i.id`
      )
      .all(...p)
  )
  const labels = ideaLabels(ctx, rows.map((r) => r.id))
  return rows.map((r) => ({ ...r, labels: labels.get(r.id) ?? [] }))
}

export function listIdeaCategories(ctx: AppContext): string[] {
  return (ctx.db.prepare("SELECT DISTINCT category FROM ideas WHERE category <> '' ORDER BY lower(category)").all() as { category: string }[]).map((r) => r.category)
}

export function getIdea(ctx: AppContext, id: number): IdeaDetail {
  const i = row(ctx, id)
  return {
    ...i,
    labels: ideaLabels(ctx, [id]).get(id) ?? [],
    attachments: camelAll<Attachment>(ctx.db.prepare('SELECT * FROM attachments WHERE idea_id = ? ORDER BY created_at, id').all(id)),
    company: i.companyId != null ? getCompany(ctx, i.companyId) : null,
    project: i.projectId != null ? camel<Project>(ctx.db.prepare('SELECT * FROM projects WHERE id = ?').get(i.projectId) as Record<string, unknown>) : null
  }
}

export function createIdea(ctx: AppContext, input: { title: string } & IdeaInput): Idea {
  const title = requireName(input.title, 'Título')
  checkLinks(ctx, input.companyId, input.projectId)
  const id = ctx.db
    .prepare('INSERT INTO ideas(title, description, category, priority, status, company_id, project_id, position) VALUES (?,?,?,?,?,?,?, (SELECT coalesce(max(position), 0) + 1024 FROM ideas))')
    .run(title, input.description ?? '', input.category?.trim() ?? '', input.priority ?? 'medium', input.status ?? 'new', input.companyId ?? null, input.projectId ?? null)
    .lastInsertRowid as number
  return row(ctx, id)
}

export function updateIdea(ctx: AppContext, id: number, patch: { title?: string } & IdeaInput): Idea {
  const cur = row(ctx, id)
  const next = {
    title: patch.title !== undefined ? requireName(patch.title, 'Título') : cur.title,
    description: patch.description ?? cur.description,
    category: patch.category !== undefined ? patch.category.trim() : cur.category,
    priority: patch.priority ?? cur.priority,
    status: patch.status ?? cur.status,
    companyId: patch.companyId !== undefined ? patch.companyId : cur.companyId,
    projectId: patch.projectId !== undefined ? patch.projectId : cur.projectId
  }
  checkLinks(ctx, next.companyId, next.projectId)
  ctx.db
    .prepare(`UPDATE ideas SET title=?, description=?, category=?, priority=?, status=?, company_id=?, project_id=?, updated_at=${TS} WHERE id=?`)
    .run(next.title, next.description, next.category, next.priority, next.status, next.companyId, next.projectId, id)
  return row(ctx, id)
}

export function setIdeaLabels(ctx: AppContext, id: number, labelIds: number[]): void {
  row(ctx, id)
  ctx.db.transaction(() => {
    ctx.db.prepare('DELETE FROM idea_labels WHERE idea_id = ?').run(id)
    const ins = ctx.db.prepare('INSERT OR IGNORE INTO idea_labels(idea_id, label_id) VALUES (?, ?)')
    for (const l of labelIds) ins.run(id, l)
  })()
}

export function deleteIdea(ctx: AppContext, id: number): void {
  row(ctx, id)
  const files = collectAttachmentPaths(ctx.db, 'a.idea_id = ?', [id])
  ctx.db.prepare('DELETE FROM ideas WHERE id = ?').run(id)
  for (const f of files) moveToDeleted(ctx.paths, f)
}

function markDeveloping(ctx: AppContext, i: Idea) {
  if (i.status === 'new' || i.status === 'analysis') ctx.db.prepare(`UPDATE ideas SET status = 'developing', updated_at = ${TS} WHERE id = ?`).run(i.id)
}

export function convertIdeaToTask(ctx: AppContext, input: { id: number; projectId: number }): Task {
  const idea = getIdea(ctx, input.id)
  if (idea.convertedTaskId != null) throw new AppError('CONFLICT', 'Esta ideia já foi transformada em tarefa.')
  const task = ctx.db.transaction(() => {
    const t = quickCreateTask(ctx, { projectId: input.projectId, title: idea.title, priority: idea.priority })
    if (idea.description) updateTask(ctx, t.id, { description: idea.description })
    if (idea.labels.length) setTaskLabels(ctx, t.id, idea.labels.map((l) => l.id))
    ctx.db.prepare(`UPDATE ideas SET converted_task_id = ?, updated_at = ${TS} WHERE id = ?`).run(t.id, idea.id)
    markDeveloping(ctx, idea)
    return t
  })()
  if (idea.attachments.length) {
    addAttachments(ctx, {
      taskId: task.id,
      sourcePaths: idea.attachments.map((a) => join(ctx.paths.attachments, a.storedPath)),
      originalNames: idea.attachments.map((a) => a.originalName)
    })
  }
  return task
}

export function convertIdeaToProject(ctx: AppContext, input: { id: number; companyId: number; folderId: number | null }): Project {
  const idea = row(ctx, input.id)
  if (idea.convertedProjectId != null) throw new AppError('CONFLICT', 'Esta ideia já foi transformada em projeto.')
  const company = getCompany(ctx, input.companyId)
  return ctx.db.transaction(() => {
    const p = createProject(ctx, { companyId: input.companyId, folderId: input.folderId, name: idea.title, description: idea.description, color: company.color })
    ctx.db.prepare(`UPDATE ideas SET converted_project_id = ?, updated_at = ${TS} WHERE id = ?`).run(p.id, idea.id)
    markDeveloping(ctx, idea)
    return p
  })()
}
