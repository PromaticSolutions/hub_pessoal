import { gzipSync } from 'node:zlib'
import { createCompany } from '@server/services/companies'
import { createProject } from '@server/services/projects'
import { getBoard } from '@server/services/boards'
import { createTask } from '@server/services/tasks'
import { addAttachments, deleteAttachment } from '@server/services/attachments'
import { createBackup, inspectBackup, restoreBackup, listAutoBackups } from '@server/services/backup'
import { compareDatasets, exportDataset, importDataset } from '@server/services/dataset'
import { LATEST_SCHEMA_VERSION } from '@server/db/migrate'
import { createTestCtx, tempUpload } from '../helpers/ctx'

let T: Awaited<ReturnType<typeof createTestCtx>>
beforeEach(async () => { T = await createTestCtx() })
afterEach(() => T.cleanup())

const snapshot = () => exportDataset(T.ctx.db, T.ctx.now())

async function seed() {
  await createCompany(T.ctx, { name: 'Empresa Backup', color: '#f00' })
  const p = await createProject(T.ctx, { companyId: 1, folderId: null, name: 'P', color: '#000' })
  const boardId = (await T.ctx.db.one<{ id: number }>('SELECT id FROM boards WHERE project_id = ?', [p.id]))!.id
  const t = await createTask(T.ctx, { columnId: (await getBoard(T.ctx, boardId, {})).columns[0].id, title: 'T' })
  const [a] = await addAttachments(T.ctx, { taskId: t.id, uploads: [await tempUpload(T.ctx.storage, 'doc.txt', 'conteúdo do anexo')] })
  return { a, t }
}

/** Puts raw bytes where a browser upload of a backup file would land. */
async function uploaded(data: string | Uint8Array): Promise<string> {
  return (await tempUpload(T.ctx.storage, 'backup.json.gz', data)).key
}

test('backup completo: roundtrip devolve contagens e linhas idênticas, com anexos', async () => {
  const { a } = await seed()
  const before = await snapshot()
  const { key, manifest: m } = await createBackup(T.ctx, 'manual')
  expect(key).toMatch(/^backups\/manual\/hub-2026-11-25_120000\.json\.gz$/)
  expect(m).toMatchObject({ app: 'personal-task-hub', schemaVersion: LATEST_SCHEMA_VERSION })
  expect(m.counts).toMatchObject({ companies: 2, projects: 1, tasks: 1, attachments: 1 })

  // change everything that matters, then restore
  await T.ctx.db.run("DELETE FROM companies WHERE name = 'Empresa Backup'")
  await deleteAttachment(T.ctx, a.id)
  expect((await inspectBackup(T.ctx, key)).counts.tasks).toBe(1)
  await restoreBackup(T.ctx, key)
  expect(compareDatasets(before, await snapshot())).toEqual([])
  expect(new TextDecoder().decode(await T.ctx.storage.get(`attachments/${a.storedPath}`))).toBe('conteúdo do anexo')
  expect(await listAutoBackups(T.ctx)).toHaveLength(1) // safety copy of the data that was replaced
})

test('restauração mantém os anexos atuais no Storage', async () => {
  const { t } = await seed()
  const { key } = await createBackup(T.ctx, 'manual')
  const [extra] = await addAttachments(T.ctx, { taskId: t.id, uploads: [await tempUpload(T.ctx.storage, 'novo.txt', 'novo')] })
  await T.ctx.db.run("DELETE FROM companies WHERE name = 'Empresa Backup'")
  await restoreBackup(T.ctx, await uploaded(await T.ctx.storage.get(key)))
  expect(await T.ctx.db.one("SELECT count(*) n FROM companies WHERE name = 'Empresa Backup'")).toEqual({ n: 1 })
  expect(await T.ctx.storage.exists(`attachments/${extra.storedPath}`)).toBe(true)
})

test('importDataset sem replace num banco com dados lança CONFLICT', async () => {
  await seed()
  const ds = await snapshot()
  await expect(importDataset(T.ctx.db, ds, { replace: false })).rejects.toMatchObject({ code: 'CONFLICT' })
})

describe('backups inválidos são rejeitados sem tocar nos dados atuais', () => {
  const json = (o: unknown) => gzipSync(Buffer.from(JSON.stringify(o)))
  const cases: [string, () => Promise<Uint8Array | string>][] = [
    ['gzip corrompido', async () => new Uint8Array([0x1f, 0x8b, 1, 2, 3, 4, 5])],
    ['json sem manifesto', async () => json({ tables: {} })],
    ['manifesto de outro app', async () => json({ manifest: { app: 'outro', schemaVersion: 1 }, tables: {} })],
    ['schema mais novo', async () => {
      const ds = await snapshot()
      return json({ ...ds, manifest: { ...ds.manifest, schemaVersion: LATEST_SCHEMA_VERSION + 1 } })
    }],
    ['arquivo que não é JSON', async () => new Uint8Array(8192).fill(7)]
  ]
  for (const [name, make] of cases) {
    test(name, async () => {
      await seed()
      const before = await snapshot()
      const key = await uploaded(await make())
      await expect(inspectBackup(T.ctx, key)).rejects.toMatchObject({ code: 'INVALID_BACKUP' })
      await expect(restoreBackup(T.ctx, key)).rejects.toMatchObject({ code: 'INVALID_BACKUP' })
      expect(compareDatasets(before, await snapshot())).toEqual([])
      expect(await listAutoBackups(T.ctx)).toEqual([])
    })
  }
})
