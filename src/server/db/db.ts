export type Row = Record<string, unknown>

/**
 * Async database handle shared by every service. SQL uses `?` placeholders
 * (converted to `$n` by the implementations). Inside `tx`, use only the `db`
 * passed to the callback; nested `tx` calls become SAVEPOINTs.
 */
export interface Db {
  one<T = Row>(sql: string, params?: unknown[]): Promise<T | undefined>
  many<T = Row>(sql: string, params?: unknown[]): Promise<T[]>
  run(sql: string, params?: unknown[]): Promise<{ rowCount: number }>
  /** Runs one or more statements without parameters (simple protocol). */
  exec(sql: string): Promise<void>
  tx<T>(fn: (db: Db) => Promise<T>): Promise<T>
}
