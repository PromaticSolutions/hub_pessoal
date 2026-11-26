import { AppError } from './errors'

const BOOL_KEYS = new Set(['isPersonal', 'done', 'effectiveArchived'])

export function camel<T>(row: Record<string, unknown>): T {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(row)) {
    const key = k.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())
    out[key] = BOOL_KEYS.has(key) ? Boolean(v) : v
  }
  return out as T
}

export function camelAll<T>(rows: unknown[]): T[] {
  return rows.map((r) => camel<T>(r as Record<string, unknown>))
}

export function must<T>(v: T | undefined | null, what = 'Registro'): T {
  if (v === undefined || v === null) throw new AppError('NOT_FOUND', `${what} não encontrado.`)
  return v
}

export function requireName(name: string | undefined, what = 'Nome'): string {
  const n = (name ?? '').trim()
  if (!n) throw new AppError('VALIDATION', `${what} é obrigatório.`)
  return n
}
