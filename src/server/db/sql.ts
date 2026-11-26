/** Converts `?` placeholders to `$1..$n`, leaving `?` inside single-quoted literals untouched. */
export function toPg(sql: string): string {
  let out = ''
  let n = 0
  let inStr = false
  for (const ch of sql) {
    if (ch === "'") inStr = !inStr // an escaped quote ('') toggles twice
    out += ch === '?' && !inStr ? `$${++n}` : ch
  }
  return out
}

/** Postgres type oids parsed to JS `number` (int8 = 20, numeric = 1700), as SQLite returned them. */
export const NUMBER_OIDS = [20, 1700] as const
export const parseNumber = (v: string): number => Number(v)
