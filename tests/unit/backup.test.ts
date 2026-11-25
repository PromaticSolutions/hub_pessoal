import { createHash } from 'node:crypto'
import { existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import archiver from 'archiver'
import { createWriteStream } from 'node:fs'
import { once } from 'node:events'
import { createCompany } from '@main/services/companies'
import { createProject } from '@main/services/projects'
import { getBoard } from '@main/services/boards'
import { createTask } from '@main/services/tasks'
import { addAttachments, getAttachmentAbsPath } from '@main/services/attachments'
import { createFullBackup, createDbBackup, inspectBackup, applyRestore } from '@main/services/backup'
import { LATEST_SCHEMA_VERSION } from '@main/db/migrate'
import { openDatabase } from '@main/db/connection'
import { resolveDataPaths, ensureDataDirs } from '@main/paths'
import { createTestCtx, tempFile } from '../helpers/ctx'

let T: ReturnType<typeof createTestCtx>
beforeEach(() => { T = createTestCtx() })
afterEach(() => T.cleanup())

const sha = (f: string) => createHash('sha256').update(readFileSync(f)).digest('hex')

function seed() {
  createCompany(T.ctx, { name: 'Empresa Backup', color: '#f00' })
  const p = createProject(T.ctx, { companyId: 1, folderId: null, name: 'P', color: '#000' })
  const boardId = (T.ctx.db.prepare('SELECT id FROM boards WHERE project_id = ?').get(p.id) as { id: number }).id
  const t = createTask(T.ctx, { columnId: getBoard(T.ctx, boardId, {}).columns[0].id, title: 'T' })
  const [a] = addAttachments(T.ctx, { taskId: t.id, sourcePaths: [tempFile('doc.txt', 'conteúdo do anexo')] })
  return { a }
}

async function zipOf(entries: Record<string, string | Buffer>): Promise<string> {
  const dest = join(mkdtempSync(join(tmpdir(), 'pth-zip-')), 'x.zip')
  const out = createWriteStream(dest)
  const arc = archiver('zip')
  arc.pipe(out)
  for (const [name, data] of Object.entries(entries)) arc.append(data, { name })
  await arc.finalize()
  await once(out, 'close')
  return dest
}

test('backup completo: roundtrip em outra pasta de dados, com anexos', async () => {
  const { a } = seed()
  const dir = join(mkdtempSync(join(tmpdir(), 'pth-bk-')), "it's dir")
  const zip = join(dir, 'backup.zip')
  const m = await createFullBackup(T.ctx, zip, '1.0.0')
  expect(m).toMatchObject({ app: 'personal-task-hub', kind: 'full', schemaVersion: LATEST_SCHEMA_VERSION, counts: { companies: 2, projects: 1, tasks: 1, attachments: 1 } })
  expect(existsSync(zip)).toBe(true)
  expect(existsSync(`${zip}.part`)).toBe(false)

  // restore into a fresh data dir
  const other = resolveDataPaths(mkdtempSync(join(tmpdir(), 'pth-other-')))
  ensureDataDirs(other)
  const ctx2 = { db: openDatabase(other.dbFile), paths: other, now: () => new Date() }
  const { manifest, stagingDir } = await inspectBackup(ctx2, zip)
  expect(manifest.counts.tasks).toBe(1)
  ctx2.db.close()
  applyRestore(other, stagingDir, new Date())
  const db = openDatabase(other.dbFile)
  expect(db.prepare("SELECT count(*) n FROM companies WHERE name = 'Empresa Backup'").get()).toEqual({ n: 1 })
  db.close()
  expect(readFileSync(join(other.attachments, a.storedPath), 'utf8')).toBe('conteúdo do anexo')
  expect(readdirSync(other.backupsPreRestore)).toHaveLength(1)
})

test('backup só do banco mantém attachments atuais na restauração', async () => {
  seed()
  const file = join(mkdtempSync(join(tmpdir(), 'pth-bkdb-')), 'hub.db')
  expect(createDbBackup(T.ctx, file, '1.0.0').kind).toBe('db')
  T.ctx.db.exec("DELETE FROM companies WHERE name = 'Empresa Backup'")
  const { stagingDir } = await inspectBackup(T.ctx, file)
  const att = T.ctx.db.prepare('SELECT id FROM attachments').get() as { id: number }
  const attPath = getAttachmentAbsPath(T.ctx, att.id)
  T.ctx.db.close()
  applyRestore(T.ctx.paths, stagingDir, new Date())
  const db = openDatabase(T.ctx.paths.dbFile)
  expect(db.prepare("SELECT count(*) n FROM companies WHERE name = 'Empresa Backup'").get()).toEqual({ n: 1 })
  db.close()
  expect(existsSync(attPath)).toBe(true)
})

describe('backups inválidos são rejeitados sem tocar nos dados atuais', () => {
  const cases: [string, () => Promise<string>][] = [
    ['zip corrompido', async () => { const f = join(mkdtempSync(join(tmpdir(), 'pth-bad-')), 'x.zip'); writeFileSync(f, 'isto não é zip'); return f }],
    ['zip sem manifest', () => zipOf({ 'hub.db': 'x' })],
    ['manifest de outro app', () => zipOf({ 'manifest.json': JSON.stringify({ app: 'outro' }), 'hub.db': 'x' })],
    ['schema mais novo', async () => {
      const f = join(mkdtempSync(join(tmpdir(), 'pth-new-')), 'hub.db')
      createDbBackup(T.ctx, f, '1')
      const db = openDatabase(f); db.pragma(`user_version = ${LATEST_SCHEMA_VERSION + 1}`); db.close()
      return f
    }],
    ['banco que não é SQLite', async () => { const f = join(mkdtempSync(join(tmpdir(), 'pth-nodb-')), 'hub.db'); writeFileSync(f, Buffer.alloc(8192, 7)); return f }]
  ]
  for (const [name, make] of cases) {
    test(name, async () => {
      seed()
      T.ctx.db.pragma('wal_checkpoint(TRUNCATE)')
      const before = sha(T.ctx.paths.dbFile)
      const file = await make()
      await expect(inspectBackup(T.ctx, file)).rejects.toMatchObject({ code: 'INVALID_BACKUP' })
      expect(sha(T.ctx.paths.dbFile)).toBe(before)
      expect(readdirSync(T.ctx.paths.restoreStaging)).toEqual([])
    })
  }
})

void mkdirSync
