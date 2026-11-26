export type Workday = { start: string; end: string }

export function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

export function fromMinutes(min: number): string {
  const m = Math.max(0, Math.min(1440, Math.round(min)))
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

export function addMinutes(hhmm: string, n: number): string {
  return fromMinutes(toMinutes(hhmm) + n)
}

export function roundTo15(min: number): number {
  return Math.round(min / 15) * 15
}

type Span = { startTime: string; endTime: string; isDone: boolean }

function union(spans: [number, number][]): [number, number][] {
  const sorted = [...spans].sort((a, b) => a[0] - b[0])
  const out: [number, number][] = []
  for (const s of sorted) {
    const last = out[out.length - 1]
    if (last && s[0] <= last[1]) last[1] = Math.max(last[1], s[1])
    else out.push([s[0], s[1]])
  }
  return out
}

export function daySummary(blocks: Span[], workday: Workday) {
  const spans = union(blocks.map((b) => [toMinutes(b.startTime), toMinutes(b.endTime)] as [number, number]))
  const ws = toMinutes(workday.start)
  const we = toMinutes(workday.end)
  const inside = union(spans.map(([a, b]) => [Math.max(a, ws), Math.min(b, we)] as [number, number]).filter(([a, b]) => b > a))
  const freeIntervals: { start: string; end: string }[] = []
  let cur = ws
  for (const [a, b] of inside) {
    if (a > cur) freeIntervals.push({ start: fromMinutes(cur), end: fromMinutes(a) })
    cur = Math.max(cur, b)
  }
  if (cur < we) freeIntervals.push({ start: fromMinutes(cur), end: fromMinutes(we) })
  return {
    planned: blocks.length,
    done: blocks.filter((b) => b.isDone).length,
    plannedMinutes: spans.reduce((n, [a, b]) => n + b - a, 0),
    freeMinutes: Math.max(0, we - ws) - inside.reduce((n, [a, b]) => n + b - a, 0),
    freeIntervals
  }
}
