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

/** Tasks in validation are delivered (awaiting sign-off): like done, they are never overdue. */
export function isOverdue(dueAt: string | null, status: 'todo' | 'in_progress' | 'review' | 'done', now: Date): boolean {
  if (!dueAt || status === 'done' || status === 'review') return false
  return (dueEnd(dueAt) as string) < toLocalMinute(now)
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  x.setDate(x.getDate() + n)
  return x
}

export function parseLocalDate(s: string): Date {
  const [y, m, d] = s.slice(0, 10).split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function getWeekRange(anchor: Date, weekStartsOn: 0 | 1): { start: string; end: string; days: string[] } {
  const offset = (anchor.getDay() - weekStartsOn + 7) % 7
  const start = addDays(anchor, -offset)
  const days = Array.from({ length: 7 }, (_, i) => toLocalDate(addDays(start, i)))
  return { start: days[0], end: days[6], days }
}
