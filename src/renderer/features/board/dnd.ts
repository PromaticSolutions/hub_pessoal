/**
 * Drop math. `overIndex` is the insertion index in the destination list
 * after removing the dragged item from it.
 */
export function computeDrop(
  cardsByColumn: Record<number, { id: number }[]>,
  activeId: number,
  overColumnId: number,
  overIndex: number
): { columnId: number; beforeId: number | null; afterId: number | null } {
  const list = (cardsByColumn[overColumnId] ?? []).filter((c) => c.id !== activeId)
  const i = Math.max(0, Math.min(overIndex, list.length))
  return { columnId: overColumnId, beforeId: list[i - 1]?.id ?? null, afterId: list[i]?.id ?? null }
}

export function computeColumnDrop(columnIds: number[], activeId: number, overIndex: number): { beforeId: number | null; afterId: number | null } {
  const list = columnIds.filter((id) => id !== activeId)
  const i = Math.max(0, Math.min(overIndex, list.length))
  return { beforeId: list[i - 1] ?? null, afterId: list[i] ?? null }
}
