import type { BrowserWindow } from 'electron'
import type { AppContext } from './context'

type Hooks = { getWindow: () => BrowserWindow | null; getContext: () => AppContext | null }
let hooks: Hooks = { getWindow: () => null, getContext: () => null }

export function setMainHooks(h: Hooks): void {
  hooks = h
}
export function getMainWindow(): BrowserWindow | null {
  return hooks.getWindow()
}
