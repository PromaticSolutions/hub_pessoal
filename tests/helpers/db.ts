import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { inject } from 'vitest'
import type { Db } from '@server/db/db'
import { NUMBER_OIDS, parseNumber } from '@server/db/sql'
import { closePgliteDb, createPgliteDb, pgliteDb, pgliteOf } from '@server/db/pglite'
import { LATEST_SCHEMA_VERSION, runMigrations, seedDefaults } from '@server/db/migrate'

/**
 * Fast fresh databases for tests.
 *
 * tests/global-setup.ts migrates one PGlite per run and saves it as a tarball. Each test file
 * loads it once into a shared instance; every createTestDb() then wipes that instance back to a
 * fresh install (DELETE all rows with triggers off, restart identities, seed) in ~15 ms.
 * If the shared instance is still in use (two live contexts, or a test that skipped cleanup),
 * a separate instance is loaded from the tarball instead (~250 ms), so isolation never breaks.
 */
type Shared = { db: Db; busy: boolean; resetSql: string }

let template: Promise<Blob> | undefined
let shared: Promise<Shared> | undefined

const parsers = Object.fromEntries(NUMBER_OIDS.map((oid) => [oid, parseNumber]))

function loadTemplate(): Promise<Blob> {
  return (template ??= (async () => {
    let file: string | undefined
    try { file = inject('pgTemplate') } catch { /* not running under the global setup */ }
    if (file) return new Blob([readFileSync(file)])
    const db = await createPgliteDb()
    await runMigrations(db)
    const blob = await pgliteOf(db).dumpDataDir('none')
    await closePgliteDb(db)
    return blob
  })())
}

async function freshInstance(): Promise<Db> {
  const pg = new PGlite({ loadDataDir: await loadTemplate(), parsers })
  await pg.waitReady
  return pgliteDb(pg)
}

async function buildShared(): Promise<Shared> {
  const db = await freshInstance()
  const tables = await db.many<{ t: string }>("SELECT tablename t FROM pg_tables WHERE schemaname = 'public' ORDER BY 1")
  const seqs = await db.many<{ s: string }>(
    `SELECT pg_get_serial_sequence(quote_ident(table_name), column_name) s FROM information_schema.columns
     WHERE table_schema = 'public' AND is_identity = 'YES'`
  )
  const resetSql = [
    'SET session_replication_role = replica;',
    ...tables.map(({ t }) => `DELETE FROM "${t}";`),
    'SET session_replication_role = DEFAULT;',
    ...seqs.map(({ s }) => `ALTER SEQUENCE ${s} RESTART;`),
    `INSERT INTO schema_version(version) VALUES (${LATEST_SCHEMA_VERSION});`
  ].join('\n')
  return { db, busy: false, resetSql }
}

export async function createTestDb(): Promise<{ db: Db; cleanup(): Promise<void> }> {
  const s = await (shared ??= buildShared())
  if (!s.busy) {
    s.busy = true
    try {
      await s.db.exec(s.resetSql)
      await seedDefaults(s.db)
    } catch (e) {
      s.busy = false
      throw e
    }
    let released = false
    return { db: s.db, async cleanup() { if (!released) { released = true; s.busy = false } } }
  }
  const db = await freshInstance()
  return { db, cleanup: () => closePgliteDb(db) }
}
