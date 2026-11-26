import type { Company, Idea, Project, TaskFilter, TaskListItem } from '@shared/types'
import type { AppContext } from '../context'
import { camelAll } from '../lib/rows'
import { buildTaskWhere, decorate, LIST_COLS } from './taskQuery'
import { listAttachments, type AttachmentListItem } from './attachments'

export type SearchType = 'task' | 'comment' | 'project' | 'company' | 'attachment' | 'idea'
export type SearchResults = {
  tasks: (TaskListItem & { snippet: string })[]
  comments: { id: number; taskId: number; taskTitle: string; snippet: string; companyColor: string; projectName: string }[]
  projects: (Project & { companyName: string; companyColor: string })[]
  companies: Company[]
  attachments: AttachmentListItem[]
  ideas: (Idea & { snippet: string })[]
}

const ACCENTS = 'áàâãäéèêëíìîïóòôõöúùûüçñ'
const PLAIN = 'aaaaaeeeeiiiiooooouuuucn'

/** Same normalization as the SQL function norm_text: lower case, common Portuguese accents removed. */
export function normText(x: string): string {
  let out = ''
  for (const ch of x.toLowerCase()) {
    const k = ACCENTS.indexOf(ch)
    out += k >= 0 ? PLAIN[k] : ch
  }
  return out
}

/** Normalized words of the query (LIKE wildcards `%`/`_` escaped); every word must appear. */
export function buildSearchTerms(text: string): string[] {
  return normText(text)
    .split(/[^\p{L}\p{N}_%]+/u)
    .filter(Boolean)
    .map((w) => w.replace(/[\\%_]/g, (c) => `\\${c}`))
}

const unescape = (t: string) => t.replace(/\\(.)/g, '$1')

/** Window of `width` words around the first match, matches wrapped in «», cut ends marked with …. */
export function makeSnippet(text: string, terms: string[], width = 12): string {
  const plain = terms.map(unescape)
  const words = text.split(/\s+/).filter(Boolean)
  const hit = (w: string) => plain.some((t) => normText(w).includes(t))
  const first = Math.max(0, words.findIndex(hit))
  const start = Math.max(0, Math.min(first - Math.floor(width / 4), words.length - width))
  const end = Math.min(words.length, start + width)
  const body = words.slice(start, end).map((w) => (hit(w) ? `«${w}»` : w)).join(' ')
  return `${start > 0 ? '…' : ''}${body}${end < words.length ? '…' : ''}`
}

type Hit = { entity_type: SearchType; entity_id: number; title: string; body: string; in_title: boolean; snip: string }

const hitCount = (text: string, terms: string[]) => {
  const n = normText(text)
  return terms.map(unescape).filter((t) => n.includes(t)).length
}

export async function search(
  ctx: AppContext,
  input: { text: string; types?: SearchType[]; filter?: TaskFilter & { createdFrom?: string; createdTo?: string }; limit?: number }
): Promise<SearchResults> {
  const empty: SearchResults = { tasks: [], comments: [], projects: [], companies: [], attachments: [], ideas: [] }
  const terms = buildSearchTerms(input.text)
  if (!terms.length) return empty
  const types = new Set<SearchType>(input.types ?? ['task', 'comment', 'project', 'company', 'attachment', 'idea'])
  const limit = input.limit ?? 50
  const likes = terms.map((t) => `%${t}%`)
  const hits = (
    await ctx.db.many<Omit<Hit, 'snip'>>(
      `SELECT entity_type, entity_id, title, body, (norm_text(title) LIKE ALL(?)) AS in_title
       FROM search_index WHERE norm LIKE ALL(?) ORDER BY in_title DESC, entity_type, entity_id LIMIT 2000`,
      [likes, likes]
    )
  ).map((h) => ({ ...h, snip: makeSnippet(h.body && hitCount(h.body, terms) > hitCount(h.title, terms) ? h.body : h.title || h.body, terms) }))
  const ids = (t: SearchType) => hits.filter((h) => h.entity_type === t)
  const filter = input.filter ?? {}
  const { where, params } = buildTaskWhere(ctx, filter)
  const cparams: unknown[] = []
  const taskWhere = where
  const out: SearchResults = { ...empty }

  if (types.has('task')) {
    const hs = ids('task')
    if (hs.length) {
      const rows = await ctx.db.many(`SELECT ${LIST_COLS} FROM v_tasks t WHERE t.id = ANY(?) AND ${taskWhere}`, [hs.map((h) => h.entity_id), ...params, ...cparams])
      const byId = new Map((await decorate(ctx, rows)).map((t) => [t.id, t]))
      out.tasks = hs.filter((h) => byId.has(h.entity_id)).slice(0, limit).map((h) => ({ ...byId.get(h.entity_id)!, snippet: h.snip }))
    }
  }
  if (types.has('comment')) {
    const hs = ids('comment')
    if (hs.length) {
      const rows = await ctx.db.many<{ id: number; task_id: number; task_title: string; company_color: string; project_name: string }>(
        `SELECT c.id, c.task_id, t.title AS task_title, t.company_color, t.project_name FROM comments c JOIN v_tasks t ON t.id = c.task_id
         WHERE c.id = ANY(?) AND ${taskWhere}`,
        [hs.map((h) => h.entity_id), ...params, ...cparams]
      )
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
      const pw: string[] = ['p.id = ANY(?)']
      const pp: unknown[] = [hs.map((h) => h.entity_id)]
      if (!filter.includeArchived) pw.push("p.archived_at IS NULL AND co.status = 'active'")
      if (filter.companyIds?.length) { pw.push('co.id = ANY(?)'); pp.push(filter.companyIds) }
      if (filter.scope === 'personal') pw.push('co.is_personal = 1')
      if (filter.scope === 'professional') pw.push('co.is_personal = 0')
      const rows = camelAll<Project & { companyName: string; companyColor: string }>(
        await ctx.db.many(`SELECT p.*, co.name AS company_name, co.color AS company_color FROM projects p JOIN companies co ON co.id = p.company_id WHERE ${pw.join(' AND ')}`, pp)
      )
      const byId = new Map(rows.map((r) => [r.id, r]))
      out.projects = hs.filter((h) => byId.has(h.entity_id)).slice(0, limit).map((h) => byId.get(h.entity_id)!)
    }
  }
  if (types.has('company')) {
    const hs = ids('company')
    if (hs.length) {
      const rows = camelAll<Company>(
        await ctx.db.many("SELECT * FROM companies WHERE id = ANY(?) AND (?::boolean OR status = 'active')", [hs.map((h) => h.entity_id), !!filter.includeArchived])
      )
      const byId = new Map(rows.map((r) => [r.id, r]))
      out.companies = hs.filter((h) => byId.has(h.entity_id)).slice(0, limit).map((h) => byId.get(h.entity_id)!)
    }
  }
  if (types.has('attachment')) {
    const hs = new Set(ids('attachment').map((h) => h.entity_id))
    if (hs.size) {
      out.attachments = (await listAttachments(ctx, { includeArchived: filter.includeArchived, companyId: filter.companyIds?.[0], projectId: filter.projectIds?.[0] }))
        .filter((a) => hs.has(a.id))
        .slice(0, limit)
    }
  }
  if (types.has('idea')) {
    const hs = ids('idea')
    if (hs.length) {
      const rows = camelAll<Idea>(
        await ctx.db.many("SELECT * FROM ideas WHERE id = ANY(?) AND (?::boolean OR status <> 'archived')", [hs.map((h) => h.entity_id), !!filter.includeArchived])
      )
      const byId = new Map(rows.map((r) => [r.id, r]))
      out.ideas = hs.filter((h) => byId.has(h.entity_id)).slice(0, limit).map((h) => ({ ...byId.get(h.entity_id)!, snippet: h.snip }))
    }
  }
  return out
}
