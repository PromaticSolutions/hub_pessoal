import { gunzipSync } from 'node:zlib'
import { runDailyAutoBackup, listAutoBackups, purgeDeletedAttachments, runDailyMaintenance } from '@server/services/maintenance'
import { createTestCtx } from '../helpers/ctx'

let T: Awaited<ReturnType<typeof createTestCtx>>
beforeEach(async () => { T = await createTestCtx() })
afterEach(() => T.cleanup())

test('runDailyAutoBackup cria um por dia e mantém só 30', async () => {
  for (let d = 1; d <= 35; d++) {
    T.setNow(new Date(2026, 9, d, 9))
    expect(await runDailyAutoBackup(T.ctx)).not.toBeNull()
  }
  T.setNow(new Date(2026, 10, 4, 18)) // day 35 = 2026-11-04
  expect(await runDailyAutoBackup(T.ctx)).toBeNull()
  const files = (await T.ctx.storage.list('backups/auto/')).map((f) => f.key)
  expect(files).toHaveLength(30)
  expect(files[0]).toBe('backups/auto/hub-2026-10-06_090000.json.gz')
  expect((await listAutoBackups(T.ctx))[0]).toMatchObject({ key: 'backups/auto/hub-2026-11-04_090000.json.gz', createdAt: new Date(2026, 10, 4, 9).toISOString() })
})

test('backup automático é íntegro e contém os dados', async () => {
  await T.ctx.db.run("INSERT INTO companies(name, color) VALUES ('Empresa X', '#000')")
  const key = (await runDailyAutoBackup(T.ctx))!
  const ds = JSON.parse(gunzipSync(await T.ctx.storage.get(key)).toString('utf8'))
  expect(ds.manifest).toMatchObject({ app: 'personal-task-hub', counts: { companies: 2 } })
  expect(ds.tables.companies.filter((c: { name: string }) => c.name === 'Empresa X')).toHaveLength(1)
})

test('purgeDeletedAttachments remove só arquivos com mais de 30 dias', async () => {
  const put = (k: string) => T.ctx.storage.put(k, new Uint8Array([1]))
  await put('deleted/2026-10-20/2026/01/old.txt')
  await put('deleted/2026-11-25/2026/01/new.txt')
  T.setNow(new Date(2026, 10, 25))
  expect(await purgeDeletedAttachments(T.ctx)).toBe(1)
  expect(await T.ctx.storage.exists('deleted/2026-10-20/2026/01/old.txt')).toBe(false)
  expect(await T.ctx.storage.exists('deleted/2026-11-25/2026/01/new.txt')).toBe(true)
})

test('manutenção diária: backup do dia e limpeza de uploads/tmp antigos', async () => {
  await T.ctx.storage.put('uploads/tmp/u1/velho.pdf', new Uint8Array([1]))
  T.setNow(new Date(Date.now() + 2 * 86_400_000))
  const r = await runDailyMaintenance(T.ctx)
  expect(r.backup).toMatch(/^backups\/auto\//)
  expect(r.purged).toBe(1)
  expect(await T.ctx.storage.exists('uploads/tmp/u1/velho.pdf')).toBe(false)
  expect((await runDailyMaintenance(T.ctx)).backup).toBeNull()
})
