import type { BrowserWindow } from 'electron'
import type { AppContext } from './context'

type Hooks = {
  getWindow: () => BrowserWindow | null
  getContext: () => AppContext | null
  requestRestore: (stagingDir: string) => void
}
let hooks: Hooks = { getWindow: () => null, getContext: () => null, requestRestore: () => {} }

export function setMainHooks(h: Hooks): void {
  hooks = h
}
export function getMainWindow(): BrowserWindow | null {
  return hooks.getWindow()
}
export function requestRestore(stagingDir: string): void {
  hooks.requestRestore(stagingDir)
}
