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
 * Limits in-flight work to `size` so postgres.js never pipelines several queries on one
 * connection: through the Supabase transaction pooler (6543) pipelined queries hang.
 * A transaction holds its slot until it ends; queries inside it run on its own connection.
 */
function gate(size: number) {
  let active = 0
  const waiting: (() => void)[] = []
  return async <T>(fn: () => Promise<T>): Promise<T> => {
    if (active < size) active++
    else await new Promise<void>((resolve) => waiting.push(resolve))
    try {
      return await fn()
    } finally {
      const next = waiting.shift()
      if (next) next()
      else active--
    }
  }
}

const POOL_SIZE = 4

/**
 * Production Db over postgres.js, for the Supabase transaction pooler (6543): `prepare: false`
 * (no prepared statements there) and `gate` (no pipelining). Few connections per instance keeps
 * many serverless instances under the pooler's client limits.
 */
export function createPgDb(url: string): Db {
  const numberType = { to: 20, from: [...NUMBER_OIDS], serialize: (v: unknown) => String(v), parse: parseNumber }
  const sql = postgres(url, {
    prepare: false,
    max: POOL_SIZE,
    idle_timeout: 20,
    onnotice: () => {},
    types: { number8: numberType }
  })
  const inner = wrap(sql, (fn) => sql.begin((s) => fn(txDb(s))) as Promise<never>)
  const run = gate(POOL_SIZE)
  const db: Db = {
    one: (t, p) => run(() => inner.one(t, p)),
    many: (t, p) => run(() => inner.many(t, p)),
    run: (t, p) => run(() => inner.run(t, p)),
    exec: (t) => run(() => inner.exec(t)),
    tx: (fn) => run(() => inner.tx(fn))
  }
  owners.set(db, sql)
  return db
}

export async function closePgDb(db: Db): Promise<void> {
  await owners.get(db)?.end({ timeout: 5 })
}
