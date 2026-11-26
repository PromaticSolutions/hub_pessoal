/**
 * SQLite (desktop v7) → Postgres + Storage import with verification (spec §8):
 * copy with VACUUM INTO, refuse a non-empty target unless `replace`, insert every table keeping
 * ids in one transaction (sequences + search index rebuilt), upload attachments/ and logos/ at the
 * same relative paths, then compare row by row and check every file's size in Storage.
 */
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import type { Db } from '../../src/server/db/db'
import { compareDatasets, exportDataset, importDataset, normalizedRows, type Dataset } from '../../src/server/services/dataset'
import type { Storage } from '../../src/server/storage/storage'
import { readSqliteDataset } from './read'

/** Tables whose md5 checksum is shown in the report (spec §8). */
const CHECKSUM_TABLES = ['tasks', 'projects', 'comments', 'ideas', 'shopping_items']

const IMAGE_MIME: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml', bmp: 'image/bmp'
}

export type ImportReport = {
  tables: { table: string; source: number; target: number; ok: boolean }[]
  checksums: { table: string; source: string; target: string; ok: boolean }[]
  diffs: { table: string; problem: string }[]
  files: { local: number; sent: number; verified: number; bytes: number; missing: string[]; mismatched: string[] }
  ok: boolean
}

type LocalFile = { key: string; abs: string; size: number }

/** Every file under `dir` (recursive) as a Storage key `<prefix>/<relative path>`. */
function walk(dir: string, prefix: string): LocalFile[] {
  if (!existsSync(dir)) return []
  const out: LocalFile[] = []
  for (const ent of readdirSync(dir, { withFileTypes: true, recursive: true })) {
    if (!ent.isFile() || ent.name.endsWith('.part')) continue
    const abs = join(ent.parentPath, ent.name)
    out.push({ key: `${prefix}/${relative(dir, abs).split(sep).join('/')}`, abs, size: statSync(abs).size })
  }
  return out.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
}

const md5 = (table: string, ds: Dataset) =>
  createHash('md5').update(JSON.stringify(normalizedRows(table, ds.tables[table] ?? []))).digest('hex')

export async function runImport(opts: {
  db: Db
  storage: Storage
  dbFile: string
  filesDir: string
  replace: boolean
  log?: (msg: string) => void
}): Promise<ImportReport> {
  const log = opts.log ?? (() => {})
  log('Lendo cópia do banco SQLite…')
  const source = readSqliteDataset(opts.dbFile)

  const local = [...walk(join(opts.filesDir, 'attachments'), 'attachments'), ...walk(join(opts.filesDir, 'logos'), 'logos')]
  const localKeys = new Set(local.map((f) => f.key))
  const mime = new Map<string, string>()
  const referenced: string[] = []
  for (const a of source.tables.attachments) {
    const key = `attachments/${String(a.stored_path)}`
    referenced.push(key)
    mime.set(key, String(a.mime_type))
  }
  for (const c of source.tables.companies) if (c.logo_path) referenced.push(String(c.logo_path))
  const missing = referenced.filter((k) => !localKeys.has(k))

  log('Importando linhas (uma transação)…')
  await importDataset(opts.db, source, { replace: opts.replace })

  log(`Enviando ${local.length} arquivo(s)…`)
  let sent = 0
  for (const f of local) {
    const ext = f.key.split('.').pop()?.toLowerCase() ?? ''
    const type = mime.get(f.key) ?? (f.key.startsWith('logos/') ? IMAGE_MIME[ext] : undefined) ?? 'application/octet-stream'
    await opts.storage.put(f.key, new Uint8Array(readFileSync(f.abs)), type)
    sent++
  }

  log('Conferindo…')
  const target = await exportDataset(opts.db, new Date())
  const diffs = compareDatasets(source, target)
  const remote = new Map<string, number>()
  for (const prefix of ['attachments/', 'logos/']) for (const o of await opts.storage.list(prefix)) remote.set(o.key, o.size)
  const mismatched = local.filter((f) => remote.get(f.key) !== f.size).map((f) => f.key)
  const verified = local.length - mismatched.length

  const tables = Object.keys(source.tables).map((t) => {
    const s = source.tables[t].length
    const d = target.tables[t]?.length ?? 0
    return { table: t, source: s, target: d, ok: s === d && !diffs.some((x) => x.table === t) }
  })
  const checksums = CHECKSUM_TABLES.map((t) => {
    const s = md5(t, source)
    const d = md5(t, target)
    return { table: t, source: s, target: d, ok: s === d }
  })
  return {
    tables,
    checksums,
    diffs,
    files: { local: local.length, sent, verified, bytes: local.reduce((n, f) => n + f.size, 0), missing, mismatched },
    ok: diffs.length === 0 && tables.every((t) => t.ok) && checksums.every((c) => c.ok) && !missing.length && !mismatched.length && sent === local.length
  }
}

export function formatReport(r: ImportReport): string {
  const w = Math.max(6, ...r.tables.map((t) => t.table.length))
  const lines = [
    `${'tabela'.padEnd(w)} | origem | destino | ok`,
    `${'-'.repeat(w)}-|--------|---------|----`,
    ...r.tables.map((t) => `${t.table.padEnd(w)} | ${String(t.source).padStart(6)} | ${String(t.target).padStart(7)} | ${t.ok ? 'ok' : 'FALHA'}`),
    '',
    'soma de verificação (md5 das linhas ordenadas por id):',
    ...r.checksums.map((c) => `  ${c.table.padEnd(w)} ${c.source} ${c.ok ? '=' : '≠'} ${c.target} ${c.ok ? 'ok' : 'FALHA'}`),
    '',
    `arquivos: ${r.files.sent} enviados, ${r.files.verified} conferidos (tamanho), ${r.files.bytes} bytes`
  ]
  if (r.files.missing.length) lines.push(`arquivos referenciados que faltam na pasta de dados (${r.files.missing.length}):`, ...r.files.missing.map((k) => `  ${k}`))
  if (r.files.mismatched.length) lines.push(`arquivos com tamanho diferente no Storage (${r.files.mismatched.length}):`, ...r.files.mismatched.map((k) => `  ${k}`))
  if (r.diffs.length) lines.push('', `diferenças (${r.diffs.length}):`, ...r.diffs.map((d) => `  ${d.table}: ${d.problem}`))
  lines.push('', r.ok ? 'RESULTADO: ok' : 'RESULTADO: FALHA')
  return lines.join('\n')
}
