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


const WEEKDAYS = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado']

function addDay(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number)
  const x = new Date(y, m - 1, d + n)
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
}

function dayLabel(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  return `${WEEKDAYS[new Date(y, m - 1, d).getDay()]}, ${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`
}

const byPriorityThenTime = (a: TaskListItem, b: TaskListItem) =>
  PRIORITY_ORDER[a.priority as Priority] - PRIORITY_ORDER[b.priority as Priority] ||
  (a.dueAt && a.dueAt.length > 10 ? a.dueAt.slice(11) : '').localeCompare(b.dueAt && b.dueAt.length > 10 ? b.dueAt.slice(11) : '')

/** Chronological list for "Minha semana" (list mode): Atrasadas first, then each day of the week that has tasks (Hoje/Amanhã labelled). */
export function groupChronological(tasks: TaskListItem[], days: string[], today: string): { key: string; label: string; items: TaskListItem[] }[] {
  const tomorrow = addDay(today, 1)
  const overdue = tasks.filter((t) => t.isOverdue && !!t.dueAt && t.dueAt.slice(0, 10) < today)
  const overdueIds = new Set(overdue.map((t) => t.id))
  const groups: { key: string; label: string; items: TaskListItem[] }[] = []
  if (overdue.length) groups.push({ key: 'overdue', label: 'Atrasadas', items: [...overdue].sort((a, b) => (a.dueAt! < b.dueAt! ? 1 : -1)) })
  for (const d of days) {
    const items = tasks.filter((t) => !overdueIds.has(t.id) && t.dueAt?.slice(0, 10) === d).sort(byPriorityThenTime)
    if (!items.length) continue
    groups.push({ key: d, label: d === today ? 'Hoje' : d === tomorrow ? 'Amanhã' : dayLabel(d), items })
  }
  return groups
}

export function dueBadge(task: TaskListItem, today: string): 'overdue' | 'today' | 'tomorrow' | null {
  if (task.status === 'done' || !task.dueAt) return null
  if (task.isOverdue) return 'overdue'
  const d = task.dueAt.slice(0, 10)
  if (d === today) return 'today'
  if (d === addDay(today, 1)) return 'tomorrow'
  return null
}
