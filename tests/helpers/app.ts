import { chromium, type Browser, type BrowserContext, type Page } from '@playwright/test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/** The web dev server started by playwright.config.ts (PGlite + local Storage, login bypass, /api/dev/reset). */
export const BASE_URL = process.env.HUB_E2E_URL ?? 'http://localhost:5199'

export function makeTempDir(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix))
}

export type App = { close(): Promise<void>; windows(): Page[] }

let browser: Browser | undefined
/** One browser context per "data dir": relaunching with the same dir = reopening the site (localStorage kept). */
const contexts = new Map<string, BrowserContext>()

async function getBrowser(): Promise<Browser> {
  // Uses the installed Google Chrome by default (PW_CHANNEL='' → Playwright's bundled Chromium).
  const channel = process.env.PW_CHANNEL ?? 'chrome'
  return (browser ??= await chromium.launch(channel ? { channel } : {}))
}

async function resetServer(): Promise<void> {
  const r = await fetch(`${BASE_URL}/api/dev/reset`, { method: 'POST' })
  if (!r.ok) throw new Error(`/api/dev/reset → ${r.status} (o servidor precisa de HUB_E2E=1)`)
}

/**
 * Opens the app in a new page. A data dir seen for the first time (or none) starts a fresh install:
 * previous contexts are closed and the dev database/files are wiped. The same dir again = "restart":
 * a new page in the same context, same data.
 */
export async function launchApp(dataDir?: string): Promise<{ app: App; page: Page }> {
  const b = await getBrowser()
  let ctx = dataDir ? contexts.get(dataDir) : undefined
  if (!ctx) {
    for (const c of contexts.values()) await c.close().catch(() => undefined)
    contexts.clear()
    await resetServer()
    ctx = await b.newContext({ baseURL: BASE_URL, viewport: { width: 1280, height: 800 }, acceptDownloads: true })
    contexts.set(dataDir ?? `anon-${Date.now()}`, ctx)
  }
  const context = ctx
  const page = await context.newPage()
  await page.goto('/')
  await page.waitForLoadState('domcontentloaded')
  await page.getByTestId('nav-settings').waitFor({ timeout: 60_000 })
  return {
    page,
    app: {
      /** Closes the tab like a user would (pagehide → pending saves are flushed). */
      close: async () => {
        if (!page.isClosed()) await page.close({ runBeforeUnload: true })
        await page.waitForEvent('close').catch(() => undefined)
      },
      windows: () => context.pages()
    }
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function invoke<T = any>(page: Page, method: string, input: unknown = {}): Promise<T> {
  const env = (await page.evaluate(
    async ([m, i]) => {
      const r = await fetch('/api/rpc', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ method: m, input: i }) })
      return r.json()
    },
    [method, input] as const
  )) as { ok: boolean; data?: T; error?: { message: string } }
  if (!env.ok) throw new Error(`${method}: ${env.error?.message}`)
  return env.data as T
}

/** Uploads a local file the way the renderer does (files.uploadUrl + PUT) and returns its UploadRef. */
export async function upload(page: Page, name: string, content: string | Buffer, mime = 'application/octet-stream') {
  const { key, url } = await invoke<{ key: string; url: string }>(page, 'files.uploadUrl', { name })
  const body = typeof content === 'string' ? Buffer.from(content) : content
  const r = await page.request.put(url, { data: body, headers: { 'content-type': mime } })
  if (!r.ok()) throw new Error(`upload ${name}: ${r.status()}`)
  return { key, name, size: body.length, mime }
}

export async function dragTo(page: Page, from: string, to: string, opts: { yOffset?: number } = {}): Promise<void> {
  const a = await page.locator(from).boundingBox()
  const b = await page.locator(to).boundingBox()
  if (!a || !b) throw new Error(`dragTo: element not found ${!a ? from : to}`)
  await page.mouse.move(a.x + a.width / 2, a.y + 10)
  await page.mouse.down()
  await page.mouse.move(a.x + a.width / 2 + 10, a.y + 20, { steps: 5 })
  await page.mouse.move(b.x + b.width / 2, b.y + (opts.yOffset ?? 10), { steps: 15 })
  await page.waitForTimeout(150)
  await page.mouse.up()
  await page.waitForTimeout(400)
}

/** Picks an option in the app's custom Select (replaces Playwright's selectOption). */
export async function pick(page: Page, testId: string, value: string): Promise<void> {
  await page.getByTestId(testId).click()
  await page.getByTestId(`${testId}-option-${value}`).click()
}
