import type { Priority, TaskListItem } from './types'
import { PRIORITY_ORDER } from './constants'

export function bucketByWeek(tasks: TaskListItem[], days: string[], now: Date): { overdue: TaskListItem[]; byDay: Record<string, TaskListItem[]> } {
  void now
  const byDay: Record<string, TaskListItem[]> = Object.fromEntries(days.map((d) => [d, [] as TaskListItem[]]))
  const overdue: TaskListItem[] = []
  for (const t of tasks) {
    if (!t.dueAt) continue
    const day = t.dueAt.slice(0, 10)
    if (byDay[day]) byDay[day].push(t)
    else if (day < days[0] && t.isOverdue) overdue.push(t)
  }
  const cmp = (a: TaskListItem, b: TaskListItem) =>
    PRIORITY_ORDER[a.priority as Priority] - PRIORITY_ORDER[b.priority as Priority] ||
    (a.dueAt!.length === 10 ? '' : a.dueAt!.slice(11)).localeCompare(b.dueAt!.length === 10 ? '' : b.dueAt!.slice(11))
  for (const d of days) byDay[d].sort(cmp)
  overdue.sort((a, b) => (a.dueAt! < b.dueAt! ? -1 : 1))
  return { overdue, byDay }
}

