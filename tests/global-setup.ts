import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { TestProject } from 'vitest/node'
import { closePgliteDb, createPgliteDb, pgliteOf } from '../src/server/db/pglite'
import { runMigrations } from '../src/server/db/migrate'

declare module 'vitest' {
  export interface ProvidedContext {
    pgTemplate: string
  }
}

/**
 * Migrates + seeds one PGlite for the whole run and saves its data dir as a tarball;
 * each test file loads it (much cheaper than booting and migrating a new instance).
 */
export default async function setup(project: TestProject) {
  const dir = mkdtempSync(join(tmpdir(), 'pth-pgtpl-'))
  const file = join(dir, 'template.tar')
  const db = await createPgliteDb()
  await runMigrations(db)
  const dump = await pgliteOf(db).dumpDataDir('none')
  writeFileSync(file, new Uint8Array(await dump.arrayBuffer()))
  await closePgliteDb(db)
  project.provide('pgTemplate', file)
  return () => rmSync(dir, { recursive: true, force: true })
}
