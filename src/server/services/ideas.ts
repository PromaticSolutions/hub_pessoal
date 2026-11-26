import { randomUUID } from 'node:crypto'
import type { Attachment, Company, Idea, IdeaStatus, Label, Priority, Project, Task } from '@shared/types'
import type { AppContext } from '../context'
import { withTx } from '../db/tx'
import { AppError } from '../lib/errors'
import { camel, camelAll, insertId, must, requireName } from '../lib/rows'
import { logActivity } from '../lib/activity'
import { collectAttachmentPaths, moveToDeleted, sanitize } from './attachments'
import { quickCreateTask } from './taskQuery'
import { setTaskLabels, updateTask } from './tasks'
import { createProject } from './projects'
import { getCompany } from './companies'

const STATUS_ORDER = "CASE i.status WHEN 'new' THEN 0 WHEN 'analysis' THEN 1 WHEN 'developing' THEN 2 WHEN 'implemented' THEN 3 ELSE 4 END"

export type IdeaListItem = Idea & { labels: Label[]; attachmentCount: number; companyName: string | null; companyColor: string | null; projectName: string | null }
export type IdeaDetail = Idea & { labels: Label[]; attachments: Attachment[]; company: Company | null; project: Project | null }
export type IdeaInput = Partial<{ description: string; category: string; priority: Priority; status: IdeaStatus; companyId: number | null; projectId: number | null }>

async function row(ctx: AppContext, id: number): Promise<Idea> {
  return camel<Idea>(must(await ctx.db.one('SELECT * FROM ideas WHERE id = ?', [id]), 'Ideia'))
}

async function ideaLabels(ctx: AppContext, ids: number[]): Promise<Map<number, Label[]>> {
  const m = new Map<number, Label[]>()
  if (!ids.length) return m
  const rows = await ctx.db.many<{ idea_id: number; id: number; name: string; color: string }>(
    'SELECT il.idea_id, l.id, l.name, l.color FROM idea_labels il JOIN labels l ON l.id = il.label_id WHERE il.idea_id = ANY(?) ORDER BY l.name COLLATE "C"',
    [ids]
  )
  for (const r of rows) m.set(r.idea_id, [...(m.get(r.idea_id) ?? []), { id: r.id, name: r.name, color: r.color }])
  return m
}

async function checkLinks(ctx: AppContext, companyId: number | null | undefined, projectId: number | null | undefined) {
  if (companyId != null) await getCompany(ctx, companyId)
  if (projectId != null) {
    const p = await ctx.db.one<{ company_id: number }>('SELECT company_id FROM projects WHERE id = ?', [projectId])
    if (!p) throw new AppError('NOT_FOUND', 'Projeto não encontrado.')
    if (companyId != null && p.company_id !== companyId) throw new AppError('VALIDATION', 'O projeto escolhido pertence a outra empresa.')
  }
}

export async function listIdeas(
  ctx: AppContext,
  f: { status?: IdeaStatus[]; category?: string; priority?: Priority; companyId?: number; labelId?: number; text?: string }
): Promise<IdeaListItem[]> {
  const w: string[] = []
  const p: unknown[] = []
  if (f.status?.length) { w.push('i.status = ANY(?)'); p.push(f.status) }
  if (f.category) { w.push('i.category = ?'); p.push(f.category) }
  if (f.priority) { w.push('i.priority = ?'); p.push(f.priority) }
  if (f.companyId) { w.push('i.company_id = ?'); p.push(f.companyId) }
  if (f.labelId) { w.push('EXISTS (SELECT 1 FROM idea_labels il WHERE il.idea_id = i.id AND il.label_id = ?)'); p.push(f.labelId) }
  if (f.text?.trim()) { w.push('(i.title ILIKE ? OR i.description ILIKE ?)'); p.push(`%${f.text.trim()}%`, `%${f.text.trim()}%`) }
  const rows = camelAll<IdeaListItem>(
    await ctx.db.many(
      `SELECT i.*, co.name AS company_name, co.color AS company_color, pr.name AS project_name,
         (SELECT count(*) FROM attachments a WHERE a.idea_id = i.id) AS attachment_count
       FROM ideas i LEFT JOIN companies co ON co.id = i.company_id LEFT JOIN projects pr ON pr.id = i.project_id
       ${w.length ? `WHERE ${w.join(' AND ')}` : ''}
       ORDER BY ${STATUS_ORDER}, i.position, i.id`,
      p
    )
  )
  const labels = await ideaLabels(ctx, rows.map((r) => r.id))
  return rows.map((r) => ({ ...r, labels: labels.get(r.id) ?? [] }))
}

export async function listIdeaCategories(ctx: AppContext): Promise<string[]> {
  return (await ctx.db.many<{ category: string }>("SELECT DISTINCT category, lower(category) FROM ideas WHERE category <> '' ORDER BY lower(category)")).map(
    (r) => r.category
  )
}

export async function getIdea(ctx: AppContext, id: number): Promise<IdeaDetail> {
  const i = await row(ctx, id)
  return {
    ...i,
    labels: (await ideaLabels(ctx, [id])).get(id) ?? [],
    attachments: camelAll<Attachment>(await ctx.db.many('SELECT * FROM attachments WHERE idea_id = ? ORDER BY created_at, id', [id])),
    company: i.companyId != null ? await getCompany(ctx, i.companyId) : null,
    project: i.projectId != null ? camel<Project>((await ctx.db.one('SELECT * FROM projects WHERE id = ?', [i.projectId]))!) : null
  }
}

export async function createIdea(ctx: AppContext, input: { title: string } & IdeaInput): Promise<Idea> {
  const title = requireName(input.title, 'Título')
  await checkLinks(ctx, input.companyId, input.projectId)
  const id = await insertId(
    ctx.db,
    'INSERT INTO ideas(title, description, category, priority, status, company_id, project_id, position) VALUES (?,?,?,?,?,?,?, (SELECT coalesce(max(position), 0) + 1024 FROM ideas))',
    [title, input.description ?? '', input.category?.trim() ?? '', input.priority ?? 'medium', input.status ?? 'new', input.companyId ?? null, input.projectId ?? null]
  )
  return row(ctx, id)
}

export async function updateIdea(ctx: AppContext, id: number, patch: { title?: string } & IdeaInput): Promise<Idea> {
  const cur = await row(ctx, id)
  const next = {
    title: patch.title !== undefined ? requireName(patch.title, 'Título') : cur.title,
    description: patch.description ?? cur.description,
    category: patch.category !== undefined ? patch.category.trim() : cur.category,
    priority: patch.priority ?? cur.priority,
    status: patch.status ?? cur.status,
    companyId: patch.companyId !== undefined ? patch.companyId : cur.companyId,
    projectId: patch.projectId !== undefined ? patch.projectId : cur.projectId
  }
  await checkLinks(ctx, next.companyId, next.projectId)
  await ctx.db.run('UPDATE ideas SET title=?, description=?, category=?, priority=?, status=?, company_id=?, project_id=?, updated_at=iso_now() WHERE id=?', [
    next.title,
    next.description,
    next.category,
    next.priority,
    next.status,
    next.companyId,
    next.projectId,
    id
  ])
  return row(ctx, id)
}

export async function setIdeaLabels(ctx: AppContext, id: number, labelIds: number[]): Promise<void> {
  await row(ctx, id)
  await withTx(ctx, async (tx) => {
    await tx.db.run('DELETE FROM idea_labels WHERE idea_id = ?', [id])
    for (const l of labelIds) await tx.db.run('INSERT INTO idea_labels(idea_id, label_id) VALUES (?, ?) ON CONFLICT DO NOTHING', [id, l])
  })
}

export async function deleteIdea(ctx: AppContext, id: number): Promise<void> {
  await row(ctx, id)
  const files = await collectAttachmentPaths(ctx.db, 'a.idea_id = ?', [id])
  await ctx.db.run('DELETE FROM ideas WHERE id = ?', [id])
  for (const f of files) await moveToDeleted(ctx.storage, f)
}

async function markDeveloping(ctx: AppContext, i: Idea) {
  if (i.status === 'new' || i.status === 'analysis') await ctx.db.run("UPDATE ideas SET status = 'developing', updated_at = iso_now() WHERE id = ?", [i.id])
}

export async function convertIdeaToTask(ctx: AppContext, input: { id: number; projectId: number }): Promise<Task> {
  const idea = await getIdea(ctx, input.id)
  if (idea.convertedTaskId != null) throw new AppError('CONFLICT', 'Esta ideia já foi transformada em tarefa.')
  return withTx(ctx, async (tx) => {
    const t = await quickCreateTask(tx, { projectId: input.projectId, title: idea.title, priority: idea.priority })
    if (idea.description) await updateTask(tx, t.id, { description: idea.description })
    if (idea.labels.length) await setTaskLabels(tx, t.id, idea.labels.map((l) => l.id))
    await tx.db.run('UPDATE ideas SET converted_task_id = ?, updated_at = iso_now() WHERE id = ?', [t.id, idea.id])
    await markDeveloping(tx, idea)
    // The idea keeps its files; the task gets its own copies (Storage copy).
    const now = tx.now()
    const sub = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}`
    for (const a of idea.attachments) {
      const rel = `${sub}/${randomUUID()}-${sanitize(a.originalName)}`
      await tx.storage.copy(`attachments/${a.storedPath}`, `attachments/${rel}`)
      await tx.db.run('INSERT INTO attachments(task_id, original_name, stored_path, mime_type, size_bytes) VALUES (?, ?, ?, ?, ?)', [
        t.id,
        a.originalName,
        rel,
        a.mimeType,
        a.sizeBytes
      ])
      await logActivity(tx.db, { entityType: 'task', entityId: t.id, taskId: t.id, action: 'attachment_added', newValue: a.originalName })
    }
    return t
  })
}

export async function convertIdeaToProject(ctx: AppContext, input: { id: number; companyId: number; folderId: number | null }): Promise<Project> {
  const idea = await row(ctx, input.id)
  if (idea.convertedProjectId != null) throw new AppError('CONFLICT', 'Esta ideia já foi transformada em projeto.')
  const company = await getCompany(ctx, input.companyId)
  return withTx(ctx, async (tx) => {
    const p = await createProject(tx, { companyId: input.companyId, folderId: input.folderId, name: idea.title, description: idea.description, color: company.color })
    await tx.db.run('UPDATE ideas SET converted_project_id = ?, updated_at = iso_now() WHERE id = ?', [p.id, idea.id])
    await markDeveloping(tx, idea)
    return p
  })
}
