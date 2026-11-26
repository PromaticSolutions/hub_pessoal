/** Browser-like tabs: pure state transitions (persisted per device in localStorage 'hub.tabs.state'). */
export type Tab = { id: string; path: string; pinned?: boolean }
export type TabsState = { tabs: Tab[]; activeId: string }

export const HOME_TAB_ID = 'home'
export const MAX_TABS = 20

let seq = 0
const newId = () => `t${Date.now().toString(36)}${(seq++).toString(36)}${Math.random().toString(36).slice(2, 6)}`

export function isDashboardPath(path: string): boolean {
  return path === '/' || path.startsWith('/?')
}

/** Removes per-visit query params (the open task modal) from a path. */
export function stripTransient(path: string): string {
  const [base, query] = path.split('?')
  if (!query) return path
  const p = new URLSearchParams(query)
  p.delete('task')
  const q = p.toString()
  return q ? `${base}?${q}` : base
}

const home = (path = '/'): Tab => ({ id: HOME_TAB_ID, path, pinned: true })

export function initialTabs(saved: unknown, lastRoute?: string): TabsState {
  const s = saved as Partial<TabsState> | null | undefined
  if (s && Array.isArray(s.tabs)) {
    const valid = s.tabs.filter((t): t is Tab => !!t && typeof t.id === 'string' && typeof t.path === 'string' && t.path.startsWith('/'))
    const homeTab = valid.find((t) => t.id === HOME_TAB_ID)
    const others = valid.filter((t) => t.id !== HOME_TAB_ID).slice(-(MAX_TABS - 1)).map((t) => ({ id: t.id, path: stripTransient(t.path) }))
    const tabs = [home(homeTab && isDashboardPath(homeTab.path) ? homeTab.path : '/'), ...others]
    const activeId = tabs.some((t) => t.id === s.activeId) ? (s.activeId as string) : HOME_TAB_ID
    return { tabs, activeId }
  }
  if (lastRoute && !isDashboardPath(lastRoute)) {
    const t = { id: newId(), path: stripTransient(lastRoute) }
    return { tabs: [home(), t], activeId: t.id }
  }
  return { tabs: [home()], activeId: HOME_TAB_ID }
}

function enforceLimit(s: TabsState): TabsState {
  let tabs = s.tabs
  while (tabs.length > MAX_TABS) {
    const victim = tabs.find((t) => !t.pinned && t.id !== s.activeId)
    if (!victim) break
    tabs = tabs.filter((t) => t !== victim)
  }
  return { ...s, tabs }
}

export function openTab(s: TabsState, path: string, opts: { activate?: boolean } = {}): TabsState {
  const clean = stripTransient(path)
  const activateIt = opts.activate ?? true
  if (isDashboardPath(clean)) return { tabs: s.tabs.map((t) => (t.id === HOME_TAB_ID ? { ...t, path: clean } : t)), activeId: HOME_TAB_ID }
  const existing = s.tabs.find((t) => !t.pinned && t.path === clean)
  if (existing) return activateIt ? { ...s, activeId: existing.id } : s
  const tab = { id: newId(), path: clean }
  const at = Math.max(1, s.tabs.findIndex((t) => t.id === s.activeId) + 1)
  const tabs = [...s.tabs.slice(0, at), tab, ...s.tabs.slice(at)]
  return enforceLimit({ tabs, activeId: activateIt ? tab.id : s.activeId })
}

/** In-app navigation: updates the active tab, except from the pinned Dashboard tab (opens/activates another tab). */
export function navigate(s: TabsState, path: string): TabsState {
  const clean = stripTransient(path)
  if (isDashboardPath(clean)) return openTab(s, clean)
  if (s.activeId === HOME_TAB_ID) return openTab(s, clean)
  return { ...s, tabs: s.tabs.map((t) => (t.id === s.activeId ? { ...t, path: clean } : t)) }
}

export function activate(s: TabsState, id: string): TabsState {
  return s.tabs.some((t) => t.id === id) ? { ...s, activeId: id } : s
}

export function closeTab(s: TabsState, id: string): TabsState {
  const i = s.tabs.findIndex((t) => t.id === id)
  if (i < 0 || s.tabs[i].pinned) return s
  const tabs = s.tabs.filter((t) => t.id !== id)
  if (s.activeId !== id) return { ...s, tabs }
  const next = tabs[i] ?? tabs[i - 1] ?? tabs[0]
  return { tabs, activeId: next.id }
}

export function moveTab(s: TabsState, id: string, toIndex: number): TabsState {
  const tab = s.tabs.find((t) => t.id === id)
  if (!tab || tab.pinned) return s
  const rest = s.tabs.filter((t) => t.id !== id)
  const at = Math.min(Math.max(1, toIndex), rest.length)
  return { ...s, tabs: [...rest.slice(0, at), tab, ...rest.slice(at)] }
}

export function cycle(s: TabsState, dir: 1 | -1): TabsState {
  const i = s.tabs.findIndex((t) => t.id === s.activeId)
  const n = s.tabs.length
  return { ...s, activeId: s.tabs[(i + dir + n) % n].id }
}

export function activateIndex(s: TabsState, n: number): TabsState {
  return s.tabs[n] ? { ...s, activeId: s.tabs[n].id } : s
}

export const TABS_STORAGE_KEY = 'hub.tabs.state'

/** Saved tabs for this browser, or null (missing, corrupt or storage blocked). */
export function loadSavedTabs(): unknown {
  try {
    const raw = globalThis.localStorage?.getItem(TABS_STORAGE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function saveTabs(s: TabsState): void {
  try {
    globalThis.localStorage?.setItem(TABS_STORAGE_KEY, JSON.stringify(s))
  } catch {
    /* storage full/blocked: tabs just won't be restored */
  }
}
