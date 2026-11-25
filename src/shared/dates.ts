const p2 = (n: number) => String(n).padStart(2, '0')

/** 'YYYY-MM-DD' in local time */
export function toLocalDate(d: Date): string {
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`
}

/** 'YYYY-MM-DDTHH:mm' in local time */
export function toLocalMinute(d: Date): string {
  return `${toLocalDate(d)}T${p2(d.getHours())}:${p2(d.getMinutes())}`
}

/** End instant of a due value: date-only values end at 23:59 of that day. */
export function dueEnd(dueAt: string | null): string | null {
  if (!dueAt) return null
  return dueAt.length === 10 ? `${dueAt}T23:59` : dueAt.slice(0, 16)
}

export function isOverdue(dueAt: string | null, status: 'todo' | 'in_progress' | 'done', now: Date): boolean {
  if (!dueAt || status === 'done') return false
  return (dueEnd(dueAt) as string) < toLocalMinute(now)
}
