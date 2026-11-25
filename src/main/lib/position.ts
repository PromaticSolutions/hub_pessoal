import type Database from 'better-sqlite3'

export const POSITION_STEP = 1024

export function positionBetween(before: number | null, after: number | null): number {
  if (before == null && after == null) return POSITION_STEP
  if (after == null) return (before as number) + POSITION_STEP
  if (before == null) return after / 2
  return (before + after) / 2
}

export function needsRenormalize(before: number | null, after: number | null): boolean {
  if (before == null || after == null) return false
  return after - before < 1e-6
}

export type PositionedTable =
  | 'columns' | 'tasks' | 'boards' | 'projects' | 'folders' | 'companies' | 'checklists' | 'checklist_items'

export function renormalize(db: Database.Database, table: PositionedTable, scopeWhere: string, params: unknown[]): void {
  const rows = db.prepare(`SELECT id FROM ${table} WHERE ${scopeWhere} ORDER BY position, id`).all(...params) as { id: number }[]
  const upd = db.prepare(`UPDATE ${table} SET position = ? WHERE id = ?`)
  db.transaction(() => rows.forEach((r, i) => upd.run((i + 1) * POSITION_STEP, r.id)))()
}

/**
 * Computes a position for inserting between two siblings identified by id
 * (null = edge). Renormalizes the scope when the gap is exhausted.
 */
export function positionForInsert(
  db: Database.Database,
  table: PositionedTable,
  scopeWhere: string,
  params: unknown[],
  beforeId: number | null,
  afterId: number | null
): number {
  const posOf = (id: number | null): number | null =>
    id == null ? null : ((db.prepare(`SELECT position FROM ${table} WHERE id = ?`).get(id) as { position: number } | undefined)?.position ?? null)
  let before = posOf(beforeId)
  let after = posOf(afterId)
  if (beforeId == null && afterId == null) {
    const max = db.prepare(`SELECT max(position) m FROM ${table} WHERE ${scopeWhere}`).get(...params) as { m: number | null }
    return positionBetween(max.m, null)
  }
  if (needsRenormalize(before, after)) {
    renormalize(db, table, scopeWhere, params)
    before = posOf(beforeId)
    after = posOf(afterId)
  }
  return positionBetween(before, after)
}
