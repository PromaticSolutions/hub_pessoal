import postgres from 'postgres'
import type { Db, Row } from './db'
import { NUMBER_OIDS, parseNumber, toPg } from './sql'

type Sql = postgres.Sql | postgres.TransactionSql
const owners = new WeakMap<Db, postgres.Sql>()

function wrap(sql: Sql, tx: <T>(fn: (db: Db) => Promise<T>) => Promise<T>): Db {
  const query = (text: string, params: unknown[] = []) => sql.unsafe(toPg(text), params as postgres.ParameterOrJSON<never>[])
  return {
    async one<T = Row>(text: string, params?: unknown[]) {
      return (await query(text, params))[0] as T | undefined
    },
    async many<T = Row>(text: string, params?: unknown[]) {
      return [...(await query(text, params))] as T[]
    },
    async run(text: string, params?: unknown[]) {
      return { rowCount: (await query(text, params)).count ?? 0 }
    },
    async exec(text: string) {
      await sql.unsafe(text).simple()
    },
    tx
  }
}

function txDb(s: postgres.TransactionSql): Db {
  return wrap(s, (fn) => s.savepoint((s2) => fn(txDb(s2))) as Promise<never>)
}

/**
 * Production Db over postgres.js. `prepare: false` because the Supabase transaction pooler
 * does not keep prepared statements. Use the SESSION pooler (5432): through the transaction pooler (6543) postgres.js pipelined queries hang.
 */
export function createPgDb(url: string): Db {
  const numberType = { to: 20, from: [...NUMBER_OIDS], serialize: (v: unknown) => String(v), parse: parseNumber }
  const sql = postgres(url, {
    prepare: false,
    max: 8,
    idle_timeout: 20,
    onnotice: () => {},
    types: { number8: numberType }
  })
  const db = wrap(sql, (fn) => sql.begin((s) => fn(txDb(s))) as Promise<never>)
  owners.set(db, sql)
  return db
}

export async function closePgDb(db: Db): Promise<void> {
  await owners.get(db)?.end({ timeout: 5 })
}
