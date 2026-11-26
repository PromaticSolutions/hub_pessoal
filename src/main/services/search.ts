import type { Company, Project, TaskFilter, TaskListItem } from '@shared/types'
import type { AppContext } from '../context'
import { camelAll } from '../lib/rows'
import { buildTaskWhere, decorate, LIST_COLS } from './taskQuery'
import { listAttachments, type AttachmentListItem } from './attachments'

export type SearchType = 'task' | 'comment' | 'project' | 'company' | 'attachment'
export type SearchResults = {
  tasks: (TaskListItem & { snippet: string })[]
  comments: { id: number; taskId: number; taskTitle: string; snippet: string; companyColor: string; projectName: string }[]
  projects: (Project & { companyName: string; companyColor: string })[]
  companies: Company[]
  attachments: AttachmentListItem[]
}

/** Every word becomes a quoted prefix term; FTS syntax in user input is neutralized. */
export function buildFtsQuery(text: string): string | null {
  const words = text.split(/[^\p{L}\p{N}_]+/u).filter(Boolean)
  if (!words.length) return null
  return words.map((w) => `"${w.replace(/"/g, '""')}"*`).join(' ')
}

type Hit = { entity_type: SearchType; entity_id: number; rank: number; snip: string }

export function search(
  ctx: AppContext,
  input: { text: string; types?: SearchType[]; filter?: TaskFilter & { createdFrom?: string; createdTo?: string }; limit?: number }
): SearchResults {
  const empty: SearchResults = { tasks: [], comments: [], projects: [], companies: [], attachments: [] }
  const q = buildFtsQuery(input.text)
  if (!q) return empty
  const types = new Set<SearchType>(input.types ?? ['task', 'comment', 'project', 'company', 'attachment'])
  const limit = input.limit ?? 50
  let hits: Hit[]
  try {
    hits = ctx.db
      .prepare(
        `SELECT entity_type, entity_id, bm25(search_index, 0, 0, 10, 1) AS rank, snippet(search_index, -1, '«', '»', '…', 12) AS snip
         FROM search_index WHERE search_index MATCH ? ORDER BY rank LIMIT 2000`
      )
      .all(q) as Hit[]
  } catch {
    return empty
  }
  const ids = (t: SearchType) => hits.filter((h) => h.entity_type === t)
  const filter = input.filter ?? {}
  const { where, params } = buildTaskWhere(ctx, filter)
  const cparams: unknown[] = []
  const taskWhere = where
  const out: SearchResults = { ...empty }

  const ph = (n: number) => Array.from({ length: n }, () => '?').join(',')

  if (types.has('task')) {
    const hs = ids('task')
    if (hs.length) {
      const rows = ctx.db
        .prepare(`SELECT ${LIST_COLS} FROM v_tasks t WHERE t.id IN (${ph(hs.length)}) AND ${taskWhere}`)
        .all(...hs.map((h) => h.entity_id), ...params, ...cparams) as Record<string, unknown>[]
      const byId = new Map(decorate(ctx, rows).map((t) => [t.id, t]))
      out.tasks = hs.filter((h) => byId.has(h.entity_id)).slice(0, limit).map((h) => ({ ...byId.get(h.entity_id)!, snippet: h.snip }))
    }
  }
  if (types.has('comment')) {
    const hs = ids('comment')
    if (hs.length) {
      const rows = ctx.db
        .prepare(
          `SELECT c.id, c.task_id, t.title AS task_title, t.company_color, t.project_name FROM comments c JOIN v_tasks t ON t.id = c.task_id
           WHERE c.id IN (${ph(hs.length)}) AND ${taskWhere}`
        )
        .all(...hs.map((h) => h.entity_id), ...params, ...cparams) as { id: number; task_id: number; task_title: string; company_color: string; project_name: string }[]
      const byId = new Map(rows.map((r) => [r.id, r]))
      out.comments = hs
        .filter((h) => byId.has(h.entity_id))
        .slice(0, limit)
        .map((h) => {
          const r = byId.get(h.entity_id)!
          return { id: r.id, taskId: r.task_id, taskTitle: r.task_title, snippet: h.snip, companyColor: r.company_color, projectName: r.project_name }
        })
    }
  }
  if (types.has('project')) {
    const hs = ids('project')
    if (hs.length) {
      const pw: string[] = [`p.id IN (${ph(hs.length)})`]
      const pp: unknown[] = hs.map((h) => h.entity_id)
      if (!filter.includeArchived) pw.push("p.archived_at IS NULL AND co.status = 'active'")
      if (filter.companyIds?.length) { pw.push(`co.id IN (${ph(filter.companyIds.length)})`); pp.push(...filter.companyIds) }
      if (filter.scope === 'personal') pw.push('co.is_personal = 1')
      if (filter.scope === 'professional') pw.push('co.is_personal = 0')
      const rows = camelAll<Project & { companyName: string; companyColor: string }>(
        ctx.db.prepare(`SELECT p.*, co.name AS company_name, co.color AS company_color FROM projects p JOIN companies co ON co.id = p.company_id WHERE ${pw.join(' AND ')}`).all(...pp)
      )
      const byId = new Map(rows.map((r) => [r.id, r]))
      out.projects = hs.filter((h) => byId.has(h.entity_id)).slice(0, limit).map((h) => byId.get(h.entity_id)!)
    }
  }
  if (types.has('company')) {
    const hs = ids('company')
    if (hs.length) {
      const rows = camelAll<Company>(
        ctx.db.prepare(`SELECT * FROM companies WHERE id IN (${ph(hs.length)}) AND (? OR status = 'active')`).all(...hs.map((h) => h.entity_id), filter.includeArchived ? 1 : 0)
      )
      const byId = new Map(rows.map((r) => [r.id, r]))
      out.companies = hs.filter((h) => byId.has(h.entity_id)).slice(0, limit).map((h) => byId.get(h.entity_id)!)
    }
  }
  if (types.has('attachment')) {
    const hs = new Set(ids('attachment').map((h) => h.entity_id))
    if (hs.size) {
      out.attachments = listAttachments(ctx, { includeArchived: filter.includeArchived, companyId: filter.companyIds?.[0], projectId: filter.projectIds?.[0] })
        .filter((a) => hs.has(a.id))
        .slice(0, limit)
    }
  }
  return out
}
