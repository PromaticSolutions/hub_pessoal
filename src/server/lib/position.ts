import type { Db } from '../db/db'

export const POSITION_STEP = 1024

export function positionBetween(before: number | null, after: number | null): number {
  if (before == null && after == null) return POSITION_STEP
  if (after == null) return (before as number) + POSITION_STEP
  if (before == null) return after / 2
  return (before + after) / 2
}

export function needsRenormalize(before: number | null, after: number | null): boolean {
  if (after == null) return false
  return after - (before ?? 0) < 1e-6
}

export type PositionedTable =
  | 'columns' | 'tasks' | 'boards' | 'projects' | 'folders' | 'companies' | 'checklists' | 'checklist_items'

/** Rewrites the scope's positions to 1024, 2048, ... keeping the current order (single statement). */
export async function renormalize(db: Db, table: PositionedTable, scopeWhere: string, params: unknown[]): Promise<void> {
  await db.run(
    `UPDATE ${table} AS x SET position = r.rn * ${POSITION_STEP}
     FROM (SELECT id, row_number() OVER (ORDER BY position, id) AS rn FROM ${table} WHERE ${scopeWhere}) r
     WHERE x.id = r.id`,
    params
  )
}

/**
 * Computes a position for inserting between two siblings identified by id
 * (null = edge). Renormalizes the scope when the gap is exhausted.
 */
export async function positionForInsert(
  db: Db,
  table: PositionedTable,
  scopeWhere: string,
  params: unknown[],
  beforeId: number | null,
  afterId: number | null
): Promise<number> {
  const posOf = async (id: number | null): Promise<number | null> =>
    id == null ? null : ((await db.one<{ position: number }>(`SELECT position FROM ${table} WHERE id = ?`, [id]))?.position ?? null)
  if (beforeId == null && afterId == null) {
    const max = await db.one<{ m: number | null }>(`SELECT max(position) m FROM ${table} WHERE ${scopeWhere}`, params)
    return positionBetween(max?.m ?? null, null)
  }
  let before = await posOf(beforeId)
  let after = await posOf(afterId)
  if (needsRenormalize(before, after)) {
    await renormalize(db, table, scopeWhere, params)
    before = await posOf(beforeId)
    after = await posOf(afterId)
  }
  return positionBetween(before, after)
}
