import { createContext, useCallback, useContext, useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react'
import { NavLink, useLocation, useNavigate, type NavLinkProps } from 'react-router-dom'
import { api } from '../lib/api'
import * as T from '../lib/tabs'

type Ctx = {
  state: T.TabsState
  open(path: string, opts?: { activate?: boolean }): void
  close(id: string): void
  activate(id: string): void
  move(id: string, toIndex: number): void
  cycle(dir: 1 | -1): void
  activateIndex(n: number): void
}

const TabsCtx = createContext<Ctx | null>(null)
export const useTabs = () => useContext(TabsCtx)!

export function TabsProvider({ children }: { children: ReactNode }) {
  const loc = useLocation()
  const nav = useNavigate()
  const [state, setState] = useState<T.TabsState>(() => T.initialTabs(undefined))
  const [ready, setReady] = useState(false)
  const stateRef = useRef(state)
  stateRef.current = state

  // Restore saved tabs once.
  useEffect(() => {
    let alive = true
    const saved = T.loadSavedTabs()
    api('settings.get', { key: 'lastRoute' })
      .catch(() => null)
      .then((last) => {
        if (!alive) return
        const hashPath = loc.pathname + loc.search
        let s = T.initialTabs(saved, typeof last === 'string' ? last : undefined)
        if (hashPath !== '/' && !saved) s = T.navigate(s, hashPath)
        setState(s)
        const active = s.tabs.find((t) => t.id === s.activeId)!
        if (active.path !== hashPath) nav(active.path, { replace: true })
        setReady(true)
      })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Any in-app navigation updates the tab model.
  useEffect(() => {
    if (!ready) return
    setState((s) => T.navigate(s, loc.pathname + loc.search))
  }, [ready, loc.pathname, loc.search])

  // Persist.
  useEffect(() => {
    if (!ready) return
    const t = setTimeout(() => T.saveTabs(state), 150)
    return () => clearTimeout(t)
  }, [ready, state])

  const go = useCallback(
    (next: T.TabsState) => {
      // Save fields that persist on blur before the current page unmounts.
      const el = document.activeElement as HTMLElement | null
      if (el && el !== document.body) el.blur()
      const prevActive = stateRef.current.tabs.find((t) => t.id === stateRef.current.activeId)
      const active = next.tabs.find((t) => t.id === next.activeId)!
      setState(next)
      if (active.id !== prevActive?.id || active.path !== loc.pathname + loc.search) nav(active.path)
    },
    [nav, loc.pathname, loc.search]
  )

  const value: Ctx = {
    state,
    open: (path, opts) => go(T.openTab(stateRef.current, path, opts)),
    close: (id) => go(T.closeTab(stateRef.current, id)),
    activate: (id) => go(T.activate(stateRef.current, id)),
    move: (id, i) => setState((s) => T.moveTab(s, id, i)),
    cycle: (dir) => go(T.cycle(stateRef.current, dir)),
    activateIndex: (n) => go(T.activateIndex(stateRef.current, n))
  }
  return <TabsCtx.Provider value={value}>{children}</TabsCtx.Provider>
}

/** Ctrl/Meta+click or middle click opens the destination in a background tab. */
export function useNewTabHandlers(to: string) {
  const tabs = useTabs()
  return {
    onClick: (e: MouseEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault()
        e.stopPropagation()
        tabs.open(to, { activate: false })
      }
    },
    onAuxClick: (e: MouseEvent) => {
      if (e.button === 1) {
        e.preventDefault()
        e.stopPropagation()
        tabs.open(to, { activate: false })
      }
    },
    onMouseDown: (e: MouseEvent) => { if (e.button === 1) e.preventDefault() }
  }
}

export function AppNavLink({ to, onClick, ...rest }: NavLinkProps & { to: string }) {
  const h = useNewTabHandlers(to)
  return (
    <NavLink
      to={to}
      {...rest}
      onClick={(e) => {
        h.onClick(e)
        if (!e.defaultPrevented) onClick?.(e)
      }}
      onAuxClick={h.onAuxClick}
      onMouseDown={h.onMouseDown}
    />
  )
}
