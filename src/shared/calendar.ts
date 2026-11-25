import type { TaskListItem } from './types'
import { PRIORITY_ORDER } from './constants'
import { addDays, toLocalDate } from './dates'

export type CalendarItem = { kind: 'due' | 'start'; date: string; time: string | null; task: TaskListItem }

export function monthGrid(anchor: Date, weekStartsOn: 0 | 1): string[][] {
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1)
  const offset = (first.getDay() - weekStartsOn + 7) % 7
  const start = addDays(first, -offset)
  return Array.from({ length: 6 }, (_, w) => Array.from({ length: 7 }, (_, d) => toLocalDate(addDays(start, w * 7 + d))))
}

export function groupItemsByDay(items: CalendarItem[]): Record<string, CalendarItem[]> {
  const out: Record<string, CalendarItem[]> = {}
  for (const i of items) (out[i.date] ??= []).push(i)
  for (const list of Object.values(out)) {
    list.sort((a, b) => {
      if (!a.time !== !b.time) return a.time ? 1 : -1
      if (a.time && b.time && a.time !== b.time) return a.time < b.time ? -1 : 1
      return PRIORITY_ORDER[a.task.priority] - PRIORITY_ORDER[b.task.priority]
    })
  }
  return out
}

export function splitTimed(items: CalendarItem[]): { allDay: CalendarItem[]; timed: CalendarItem[] } {
  return { allDay: items.filter((i) => !i.time), timed: items.filter((i) => i.time) }
}
