// Dev/test only: production never imports this module.
import { PGlite, type Transaction } from '@electric-sql/pglite'
import type { Db, Row } from './db'
import { NUMBER_OIDS, parseNumber, toPg } from './sql'

const parsers = Object.fromEntries(NUMBER_OIDS.map((oid) => [oid, parseNumber]))
const owners = new WeakMap<Db, PGlite>()

type Queryable = Pick<PGlite | Transaction, 'query' | 'exec'>

function wrap(q: Queryable, tx: <T>(fn: (db: Db) => Promise<T>) => Promise<T>): Db {
  const query = <T>(sql: string, params: unknown[] = []) => q.query<T>(toPg(sql), params, { parsers })
  return {
    async one<T = Row>(sql: string, params?: unknown[]) {
      return (await query<T>(sql, params)).rows[0]
    },
    async many<T = Row>(sql: string, params?: unknown[]) {
      return (await query<T>(sql, params)).rows
    },
    async run(sql: string, params?: unknown[]) {
      return { rowCount: (await query(sql, params)).affectedRows ?? 0 }
    },
    async exec(sql: string) {
      await q.exec(sql)
    },
    tx
  }
}

let savepointSeq = 0

/** Db bound to an open PGlite transaction; nested `tx` calls use SAVEPOINTs. */
function txDb(t: Transaction): Db {
  const db: Db = wrap(t, async (fn) => {
    const sp = `sp_${++savepointSeq}`
    await t.exec(`SAVEPOINT ${sp}`)
    try {
      const out = await fn(db)
      await t.exec(`RELEASE SAVEPOINT ${sp}`)
      return out
    } catch (e) {
      await t.exec(`ROLLBACK TO SAVEPOINT ${sp}`)
      throw e
    }
  })
  return db
}

/** Wraps an existing PGlite instance (e.g. a clone) as a Db. */
export function pgliteDb(pg: PGlite): Db {
  const db = wrap(pg, (fn) => pg.transaction((t) => fn(txDb(t))))
  owners.set(db, pg)
  return db
}

/** In-memory database when `dataDir` is omitted, otherwise persisted in that directory. */
export async function createPgliteDb(dataDir?: string): Promise<Db> {
  const pg = new PGlite(dataDir, { parsers })
  await pg.waitReady
  return pgliteDb(pg)
}

export function pgliteOf(db: Db): PGlite {
  const pg = owners.get(db)
  if (!pg) throw new Error('Not a top-level PGlite Db')
  return pg
}

export async function closePgliteDb(db: Db): Promise<void> {
  const pg = owners.get(db)
  if (pg && !pg.closed) await pg.close()
}
