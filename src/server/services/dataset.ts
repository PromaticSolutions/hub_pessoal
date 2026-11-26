/**
 * Whole-database snapshot as plain rows (backup/restore and the SQLite → Postgres import).
 * search_index is not part of the dataset: triggers rebuild it on import.
 */
import type { Db, Row } from '../db/db'
import { LATEST_SCHEMA_VERSION, syncSequences } from '../db/migrate'
import { AppError } from '../lib/errors'

export type Dataset = {
  manifest: { app: 'personal-task-hub'; schemaVersion: number; createdAt: string; counts: Record<string, number> }
  tables: Record<string, Row[]>
}

/** Every data table, parents before children (insert in this order, delete in reverse). */
export const TABLES_IN_ORDER: string[] = [
  'companies',
  'folders',
  'projects',
  'boards',
  'columns',
  'tasks',
  'labels',
  'task_labels',
  'comments',
  'checklists',
  'checklist_items',
  'ideas',
  'idea_labels',
  'attachments',
  'activity_log',
  'settings',
  'day_blocks',
  'shopping_items',
  'dashboards',
  'dashboard_widgets'
]

/** Primary key columns per table (default `id`). */
const KEYS: Record<string, string[]> = {
  task_labels: ['task_id', 'label_id'],
  idea_labels: ['idea_id', 'label_id'],
  settings: ['key']
}
export const keyOf = (table: string): string[] => KEYS[table] ?? ['id']

const ident = (name: string) => `"${name.replace(/"/g, '""')}"`

export async function exportDataset(db: Db, now: Date): Promise<Dataset> {
  const schemaVersion = (await db.one<{ v: number | null }>('SELECT max(version) v FROM schema_version'))?.v ?? 0
  const tables: Record<string, Row[]> = {}
  const counts: Record<string, number> = {}
  for (const t of TABLES_IN_ORDER) {
    const order = keyOf(t).map((k) => (k === 'key' ? `${ident(k)} COLLATE "C"` : ident(k)))
    tables[t] = await db.many(`SELECT * FROM ${ident(t)} ORDER BY ${order.join(', ')}`)
    counts[t] = tables[t].length
  }
  return { manifest: { app: 'personal-task-hub', schemaVersion, createdAt: now.toISOString(), counts }, tables }
}

/** Folders sorted so that every parent comes before its children (parent_id references folders). */
function parentsFirst(rows: Row[]): Row[] {
  const byId = new Map(rows.map((r) => [r.id, r]))
  const out: Row[] = []
  const done = new Set<unknown>()
  const visiting = new Set<unknown>()
  const visit = (r: Row) => {
    if (done.has(r.id)) return
    if (visiting.has(r.id)) throw new AppError('INVALID_BACKUP', `Pastas em ciclo (id ${String(r.id)}).`)
    visiting.add(r.id)
    const parent = r.parent_id == null ? undefined : byId.get(r.parent_id)
    if (parent) visit(parent)
    visiting.delete(r.id)
    done.add(r.id)
    out.push(r)
  }
  for (const r of rows) visit(r)
  return out
}

/**
 * Loads `ds` into `db` in one transaction, keeping ids. Refuses (CONFLICT) a database that already
 * has data unless `replace`, which first deletes everything (children first). The search index is
 * rebuilt by the triggers and the identity sequences continue after the imported ids.
 */
export async function importDataset(db: Db, ds: Dataset, opts: { replace: boolean }): Promise<void> {
  if (ds?.manifest?.app !== 'personal-task-hub' || typeof ds.tables !== 'object' || ds.tables === null) {
    throw new AppError('INVALID_BACKUP', 'Arquivo de dados inválido.')
  }
  if (ds.manifest.schemaVersion > LATEST_SCHEMA_VERSION) {
    throw new AppError('SCHEMA_TOO_NEW', 'Estes dados foram criados por uma versão mais nova do aplicativo.')
  }
  // v1 data fits v2 unchanged (v2 only widened the column category check).
  if (!(ds.manifest.schemaVersion >= 1)) {
    throw new AppError('INVALID_BACKUP', `Versão de dados não suportada: ${ds.manifest.schemaVersion}.`)
  }
  const unknown = Object.keys(ds.tables).filter((t) => !TABLES_IN_ORDER.includes(t))
  if (unknown.length) throw new AppError('INVALID_BACKUP', `Tabela desconhecida: ${unknown.join(', ')}.`)

  await db.tx(async (t) => {
    const cols = new Map<string, Set<string>>()
    for (const r of await t.many<{ table_name: string; column_name: string }>(
      "SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = ANY(?)",
      [TABLES_IN_ORDER]
    )) {
      if (!cols.has(r.table_name)) cols.set(r.table_name, new Set())
      cols.get(r.table_name)!.add(r.column_name)
    }

    for (const table of TABLES_IN_ORDER) {
      if (await t.one(`SELECT 1 FROM ${ident(table)} LIMIT 1`)) {
        if (!opts.replace) throw new AppError('CONFLICT', 'O banco de destino já tem dados.')
        break
      }
    }
    if (opts.replace) {
      for (const table of [...TABLES_IN_ORDER].reverse()) await t.run(`DELETE FROM ${ident(table)}`)
      await t.run('DELETE FROM search_index')
    }

    for (const table of TABLES_IN_ORDER) {
      let rows = ds.tables[table] ?? []
      if (!Array.isArray(rows)) throw new AppError('INVALID_BACKUP', `Tabela ${table} inválida.`)
      if (!rows.length) continue
      if (table === 'folders') rows = parentsFirst(rows)
      const known = cols.get(table)!
      const names = Object.keys(rows[0])
      const bad = names.filter((c) => !known.has(c))
      if (bad.length) throw new AppError('INVALID_BACKUP', `Coluna desconhecida em ${table}: ${bad.join(', ')}.`)
      // Stay well under Postgres' 65535 bind parameters per statement.
      const perStmt = Math.max(1, Math.min(500, Math.floor(30000 / names.length)))
      const head = `INSERT INTO ${ident(table)} (${names.map(ident).join(', ')}) VALUES `
      const tuple = `(${names.map(() => '?').join(', ')})`
      for (let i = 0; i < rows.length; i += perStmt) {
        const chunk = rows.slice(i, i + perStmt)
        const params: unknown[] = []
        for (const r of chunk) {
          if (Object.keys(r).length !== names.length) throw new AppError('INVALID_BACKUP', `Linha com colunas diferentes em ${table}.`)
          for (const c of names) {
            if (!(c in r)) throw new AppError('INVALID_BACKUP', `Linha com colunas diferentes em ${table}.`)
            params.push(r[c] ?? null)
          }
        }
        await t.run(head + chunk.map(() => tuple).join(', '), params)
      }
    }
    await syncSequences(t)
  })
}

/* ---------- comparison ---------- */

function norm(v: unknown): unknown {
  if (v === undefined || v === null) return null
  if (typeof v === 'bigint') return Number(v)
  if (typeof v === 'boolean') return v ? 1 : 0
  if (v instanceof Uint8Array) return `\\x${Buffer.from(v).toString('hex')}`
  if (v instanceof Date) return v.toISOString()
  return v
}

function cmp(a: unknown, b: unknown): number {
  if (a === b) return 0
  if (a === null) return -1
  if (b === null) return 1
  if (typeof a === 'number' && typeof b === 'number') return a - b
  const x = String(a)
  const y = String(b)
  return x < y ? -1 : x > y ? 1 : 0
}

const show = (v: unknown) => (typeof v === 'string' ? JSON.stringify(v.length > 60 ? `${v.slice(0, 60)}…` : v) : String(v))

/** Rows of `table` with normalised values (numbers, NULLs), sorted by primary key. */
export function normalizedRows(table: string, rows: Row[]): Row[] {
  const key = keyOf(table)
  return rows
    .map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, norm(v)])))
    .sort((a, b) => {
      for (const k of key) {
        const c = cmp(a[k], b[k])
        if (c) return c
      }
      return 0
    })
}

/**
 * Differences between two datasets: per table, row count and row-by-row equality (rows sorted by
 * primary key, numbers normalised). Empty = identical. At most 10 problems are listed per table.
 */
export function compareDatasets(a: Dataset, b: Dataset): { table: string; problem: string }[] {
  const out: { table: string; problem: string }[] = []
  const tables = [...TABLES_IN_ORDER, ...new Set([...Object.keys(a.tables), ...Object.keys(b.tables)].filter((t) => !TABLES_IN_ORDER.includes(t)))]
  for (const table of tables) {
    const ra = normalizedRows(table, a.tables[table] ?? [])
    const rb = normalizedRows(table, b.tables[table] ?? [])
    const problems: string[] = []
    if (ra.length !== rb.length) problems.push(`contagem difere: ${ra.length} ≠ ${rb.length}`)
    const key = keyOf(table)
    const keyText = (r: Row) => key.map((k) => `${k}=${String(r[k])}`).join(',')
    for (let i = 0, j = 0; (i < ra.length || j < rb.length) && problems.length < 10; ) {
      const x = ra[i]
      const y = rb[j]
      const order = !x ? 1 : !y ? -1 : key.reduce((c, k) => c || cmp(x[k], y[k]), 0)
      if (order < 0) { problems.push(`linha ${keyText(x)} só existe na origem`); i++; continue }
      if (order > 0) { problems.push(`linha ${keyText(y)} só existe no destino`); j++; continue }
      for (const c of new Set([...Object.keys(x), ...Object.keys(y)])) {
        if (!(c in x) || !(c in y)) { problems.push(`linha ${keyText(x)}: coluna ${c} ausente ${c in x ? 'no destino' : 'na origem'}`); continue }
        const same = typeof x[c] === 'number' && typeof y[c] === 'number' ? Object.is(x[c], y[c]) || x[c] === y[c] : x[c] === y[c]
        if (!same) problems.push(`linha ${keyText(x)}: ${c} difere (${show(x[c])} ≠ ${show(y[c])})`)
      }
      i++
      j++
    }
    for (const problem of problems) out.push({ table, problem })
  }
  return out
}
