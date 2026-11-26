// Dev/e2e context: PGlite in <dataDir>/pg and local Storage in <dataDir>/files. Never used in production.
import { mkdirSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import type { AppContext } from './context'
import { closePgliteDb, createPgliteDb } from './db/pglite'
import { runMigrations } from './db/migrate'
import { createLocalStorage } from './storage/local'

export const DEV_FILES_BASE = '/api/dev-files'

export async function createDevContext(opts: { dataDir: string }): Promise<AppContext> {
  const root = resolve(opts.dataDir)
  mkdirSync(join(root, 'pg'), { recursive: true })
  mkdirSync(join(root, 'files'), { recursive: true })
  const db = await createPgliteDb(join(root, 'pg'))
  await runMigrations(db)
  return { db, storage: createLocalStorage(join(root, 'files'), DEV_FILES_BASE), now: () => new Date() }
}

/** Closes the database and wipes `dataDir` (database and files): the next context is a fresh install. */
export async function destroyDevContext(ctx: AppContext, opts: { dataDir: string }): Promise<void> {
  await closePgliteDb(ctx.db)
  rmSync(resolve(opts.dataDir), { recursive: true, force: true })
}
