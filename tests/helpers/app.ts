import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

export function makeTempDir(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix))
}

export async function launchApp(dataDir: string): Promise<{ app: ElectronApplication; page: Page }> {
  const app = await electron.launch({
    args: [resolve(__dirname, '../../out/main/index.js')],
    env: { ...process.env, PTH_DATA_DIR: dataDir, ELECTRON_RUN_AS_NODE: '' }
  })
  const page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  return { app, page }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function invoke<T = any>(page: Page, method: string, input: unknown = {}): Promise<T> {
  const res = await page.evaluate(([m, i]) => (window as unknown as { api: { invoke(m: string, i: unknown): Promise<unknown> } }).api.invoke(m as string, i), [method, input] as const)
  const env = res as { ok: boolean; data?: T; error?: { message: string } }
  if (!env.ok) throw new Error(`${method}: ${env.error?.message}`)
  return env.data as T
}
