import { closeSync, mkdirSync, openSync, readdirSync, utimesSync, writeFileSync, writeSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { quickCheck, runDailyAutoBackup, listAutoBackups, purgeDeletedAttachments, closeDatabase } from '@main/services/maintenance'
import { openDatabase } from '@main/db/connection'
import { createTestDb } from '../helpers/db'

let t: ReturnType<typeof createTestDb>
beforeEach(() => { t = createTestDb() })
afterEach(() => t.cleanup())

test('runDailyAutoBackup cria um por dia e mantém só 14', () => {
  for (let d = 1; d <= 20; d++) {
    expect(runDailyAutoBackup(t.db, t.paths, new Date(2026, 9, d, 9))).not.toBeNull()
  }
  expect(runDailyAutoBackup(t.db, t.paths, new Date(2026, 9, 20, 18))).toBeNull()
  const files = readdirSync(t.paths.backupsAuto)
  expect(files).toHaveLength(14)
  expect(files.sort()[0]).toBe('hub-2026-10-07.db')
  expect(listAutoBackups(t.paths)[0].date).toBe('2026-10-20')
})

test('backup automático é íntegro e contém os dados', () => {
  t.db.exec("INSERT INTO companies(name, color) VALUES ('Empresa X', '#000')")
  const file = runDailyAutoBackup(t.db, t.paths, new Date())!
  const copy = openDatabase(file)
  expect(quickCheck(copy)).toBe(true)
  expect(copy.prepare("SELECT count(*) n FROM companies WHERE name = 'Empresa X'").get()).toEqual({ n: 1 })
  copy.close()
})

test('purgeDeletedAttachments remove só arquivos com mais de 30 dias', () => {
  const dir = join(t.paths.attachmentsDeleted, '2026', '01')
  mkdirSync(dir, { recursive: true })
  const oldF = join(dir, 'old.txt')
  const newF = join(dir, 'new.txt')
  writeFileSync(oldF, 'a')
  writeFileSync(newF, 'b')
  const now = new Date(2026, 10, 25)
  const old = new Date(2026, 9, 20)
  utimesSync(oldF, old, old)
  expect(purgeDeletedAttachments(t.paths, now)).toBe(1)
  expect(existsSync(oldF)).toBe(false)
  expect(existsSync(newF)).toBe(true)
})

test('quickCheck retorna false para arquivo de banco corrompido', () => {
  t.db.exec('CREATE TABLE big(x)')
  const ins = t.db.prepare('INSERT INTO big VALUES (?)')
  for (let i = 0; i < 2000; i++) ins.run('x'.repeat(200))
  closeDatabase(t.db)
  const fd = openSync(t.paths.dbFile, 'r+')
  writeSync(fd, Buffer.alloc(8192, 0xab), 0, 8192, 4096 * 3)
  closeSync(fd)
  let ok: boolean
  try {
    const db = openDatabase(t.paths.dbFile)
    ok = quickCheck(db)
    db.close()
  } catch {
    ok = false
  }
  expect(ok).toBe(false)
})
