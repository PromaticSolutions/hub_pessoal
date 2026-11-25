import { mkdirSync, rmSync } from 'node:fs'
import { dirname } from 'node:path'
import type Database from 'better-sqlite3'

export function sqlQuote(s: string): string {
  return `'${s.replace(/'/g, "''")}'`
}

/** Consistent copy of the live database (safe with WAL). Overwrites dest. */
export function vacuumInto(db: Database.Database, dest: string): void {
  mkdirSync(dirname(dest), { recursive: true })
  rmSync(dest, { force: true })
  db.exec(`VACUUM INTO ${sqlQuote(dest)}`)
}

export function nowIso(d: Date = new Date()): string {
  return d.toISOString()
}

export function fileStamp(d: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
}
