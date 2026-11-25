/** Tracks pending saves so closing the modal or the app never drops typed text. */
const inflight = new Set<Promise<unknown>>()
const flushers = new Set<() => Promise<void>>()

export function track<T>(p: Promise<T>): Promise<T> {
  inflight.add(p)
  p.finally(() => inflight.delete(p)).catch(() => {})
  return p
}

export function registerFlusher(fn: () => Promise<void>): () => void {
  flushers.add(fn)
  return () => { flushers.delete(fn) }
}

/** Blurs the focused field (triggering save-on-blur), runs registered flushers and waits for every pending save. */
export async function flushAll(): Promise<void> {
  const el = document.activeElement as HTMLElement | null
  if (el && el !== document.body) el.blur()
  await Promise.allSettled([...flushers].map((f) => f()))
  for (let i = 0; i < 5 && inflight.size; i++) await Promise.allSettled([...inflight])
}
