import { createWriteStream, existsSync, mkdirSync, readFileSync, renameSync, rmSync, copyFileSync } from 'node:fs'
import { once } from 'node:events'
import { basename, dirname, join, resolve } from 'node:path'
import archiver from 'archiver'
import extract from 'extract-zip'
import Database from 'better-sqlite3'
import type { AppContext } from '../context'
import type { DataPaths } from '../paths'
import { AppError } from '../lib/errors'
import { LATEST_SCHEMA_VERSION } from '../db/migrate'
import { fileStamp, vacuumInto } from '../db/sqlutil'

export type BackupManifest = {
  app: 'personal-task-hub'
  appVersion: string
  schemaVersion: number
  createdAt: string
  kind: 'full' | 'db'
  counts: { companies: number; projects: number; tasks: number; attachments: number }
}

function counts(db: Database.Database): BackupManifest['counts'] {
  const n = (t: string) => (db.prepare(`SELECT count(*) n FROM ${t}`).get() as { n: number }).n
  return { companies: n('companies'), projects: n('projects'), tasks: n('tasks'), attachments: n('attachments') }
}

function manifestFor(db: Database.Database, kind: 'full' | 'db', appVersion: string, now: Date): BackupManifest {
  return {
    app: 'personal-task-hub',
    appVersion,
    schemaVersion: db.pragma('user_version', { simple: true }) as number,
    createdAt: now.toISOString(),
    kind,
    counts: counts(db)
  }
}

export async function createFullBackup(ctx: AppContext, destZip: string, appVersion: string): Promise<BackupManifest> {
  const work = join(ctx.paths.restoreStaging, `backup-${fileStamp(ctx.now())}-${process.pid}`)
  mkdirSync(work, { recursive: true })
  const dbCopy = join(work, 'hub.db')
  const part = `${destZip}.part`
  try {
    vacuumInto(ctx.db, dbCopy)
    const manifest = manifestFor(ctx.db, 'full', appVersion, ctx.now())
    mkdirSync(dirname(destZip), { recursive: true })
    const out = createWriteStream(part)
    const arc = archiver('zip', { zlib: { level: 6 } })
    const failed = new Promise<never>((_, rej) => { arc.on('error', rej); out.on('error', rej) })
    arc.pipe(out)
    arc.file(dbCopy, { name: 'hub.db' })
    if (existsSync(ctx.paths.attachments)) arc.directory(ctx.paths.attachments, 'attachments')
    if (existsSync(ctx.paths.logos)) arc.directory(ctx.paths.logos, 'logos')
    arc.append(JSON.stringify(manifest, null, 2), { name: 'manifest.json' })
    await Promise.race([arc.finalize().then(() => once(out, 'close')), failed])
    renameSync(part, destZip)
    return manifest
  } catch (e) {
    rmSync(part, { force: true })
    throw e
  } finally {
    rmSync(work, { recursive: true, force: true })
  }
}

export function createDbBackup(ctx: AppContext, destDb: string, appVersion: string): BackupManifest {
  vacuumInto(ctx.db, destDb)
  return manifestFor(ctx.db, 'db', appVersion, ctx.now())
}

function invalid(msg: string): never {
  throw new AppError('INVALID_BACKUP', msg)
}

function validateDb(file: string): { schemaVersion: number; counts: BackupManifest['counts'] } {
  let db: Database.Database | null = null
  try {
    db = new Database(file, { readonly: true, fileMustExist: true })
    if (db.pragma('integrity_check', { simple: true }) !== 'ok') invalid('O banco de dados do backup está danificado.')
    const v = db.pragma('user_version', { simple: true }) as number
    if (v > LATEST_SCHEMA_VERSION) invalid('Este backup foi criado por uma versão mais nova do aplicativo.')
    if (v < 1) invalid('O arquivo não é um banco de dados do Personal Task Hub.')
    return { schemaVersion: v, counts: counts(db) }
  } catch (e) {
    if (e instanceof AppError) throw e
    throw new AppError('INVALID_BACKUP', 'O arquivo não é um banco de dados válido.')
  } finally {
    db?.close()
  }
}

/** Unpacks/copies a backup into restore-staging and validates it. Current data is never touched. */
export async function inspectBackup(ctx: AppContext, file: string): Promise<{ manifest: BackupManifest; stagingDir: string }> {
  const stagingDir = resolve(ctx.paths.restoreStaging, `restore-${fileStamp(ctx.now())}-${Math.random().toString(36).slice(2, 8)}`)
  mkdirSync(stagingDir, { recursive: true })
  try {
    if (!existsSync(file)) invalid('Arquivo de backup não encontrado.')
    if (file.toLowerCase().endsWith('.zip')) {
      try {
        await extract(file, { dir: stagingDir })
      } catch {
        invalid('O arquivo .zip está corrompido ou não pôde ser aberto.')
      }
      const mf = join(stagingDir, 'manifest.json')
      if (!existsSync(mf)) invalid('O backup não contém manifest.json — não é um backup do Personal Task Hub.')
      let manifest: BackupManifest
      try {
        manifest = JSON.parse(readFileSync(mf, 'utf8')) as BackupManifest
      } catch {
        invalid('manifest.json inválido.')
      }
      if (manifest.app !== 'personal-task-hub') invalid('Este backup não pertence ao Personal Task Hub.')
      if (!existsSync(join(stagingDir, 'hub.db'))) invalid('O backup não contém o banco de dados.')
      const v = validateDb(join(stagingDir, 'hub.db'))
      return { manifest: { ...manifest, kind: 'full', schemaVersion: v.schemaVersion, counts: v.counts }, stagingDir }
    }
    copyFileSync(file, join(stagingDir, 'hub.db'))
    const v = validateDb(join(stagingDir, 'hub.db'))
    return {
      manifest: { app: 'personal-task-hub', appVersion: '?', schemaVersion: v.schemaVersion, createdAt: '', kind: 'db', counts: v.counts },
      stagingDir
    }
  } catch (e) {
    rmSync(stagingDir, { recursive: true, force: true })
    throw e
  }
}

/**
 * Swaps the staged backup into place. MUST be called with the database closed.
 * Current files are moved (not deleted) to backups/pre-restore/<stamp>/.
 */
export function applyRestore(paths: DataPaths, stagingDir: string, now: Date): string {
  if (!existsSync(join(stagingDir, 'hub.db'))) invalid('Backup preparado não encontrado. Selecione o arquivo novamente.')
  const full = existsSync(join(stagingDir, 'manifest.json'))
  const aside = join(paths.backupsPreRestore, `${fileStamp(now)}-${basename(stagingDir)}`)
  mkdirSync(aside, { recursive: true })
  const undo: [string, string][] = [] // [from, to] renames to reverse on failure
  const mv = (from: string, to: string) => {
    renameSync(from, to)
    undo.push([from, to])
  }
  try {
    for (const s of ['', '-wal', '-shm']) {
      const f = paths.dbFile + s
      if (existsSync(f)) mv(f, join(aside, `hub.db${s}`))
    }
    mv(join(stagingDir, 'hub.db'), paths.dbFile)
    if (full) {
      for (const [dir, name] of [[paths.attachments, 'attachments'], [paths.logos, 'logos']] as const) {
        if (existsSync(dir)) mv(dir, join(aside, name))
        const staged = join(stagingDir, name)
        if (existsSync(staged)) mv(staged, dir)
        else mkdirSync(dir, { recursive: true })
      }
    }
  } catch (e) {
    for (const [from, to] of undo.reverse()) {
      try { renameSync(to, from) } catch { /* best effort: originals remain in backups/pre-restore */ }
    }
    throw new AppError('INTERNAL', `Falha ao restaurar; os dados atuais foram mantidos. (${(e as Error).message})`)
  }
  rmSync(stagingDir, { recursive: true, force: true })
  return aside
}
