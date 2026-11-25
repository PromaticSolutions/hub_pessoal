import { app, dialog, shell } from 'electron'
import { getMainWindow } from '../mainHooks'

export async function pickFiles(opts: { multiple: boolean; images?: boolean }): Promise<string[]> {
  const win = getMainWindow()
  const props: ('openFile' | 'multiSelections')[] = opts.multiple ? ['openFile', 'multiSelections'] : ['openFile']
  const filters = opts.images ? [{ name: 'Imagens', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'] }] : undefined
  const r = win ? await dialog.showOpenDialog(win, { properties: props, filters }) : await dialog.showOpenDialog({ properties: props, filters })
  return r.canceled ? [] : r.filePaths
}

export async function pickSavePath(defaultPath: string): Promise<string | null> {
  const win = getMainWindow()
  const o = { defaultPath }
  const r = win ? await dialog.showSaveDialog(win, o) : await dialog.showSaveDialog(o)
  return r.canceled || !r.filePath ? null : r.filePath
}

export async function pickOpenPath(extensions: string[]): Promise<string | null> {
  const win = getMainWindow()
  const o = { properties: ['openFile' as const], filters: [{ name: 'Backup', extensions }] }
  const r = win ? await dialog.showOpenDialog(win, o) : await dialog.showOpenDialog(o)
  return r.canceled ? null : r.filePaths[0] ?? null
}

export async function openPath(p: string): Promise<string> {
  return shell.openPath(p)
}

export function revealPath(p: string): void {
  shell.showItemInFolder(p)
}

export function documentsDir(): string {
  return app.getPath('documents')
}

export function appVersion(): string {
  return app.getVersion()
}

export async function openExternal(url: string): Promise<void> {
  await shell.openExternal(url)
}
