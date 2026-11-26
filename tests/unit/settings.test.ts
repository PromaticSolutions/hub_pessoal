import { getSetting, setSetting, getAllSettings } from '@server/services/settings'
import { createTestDb } from '../helpers/db'

let t: Awaited<ReturnType<typeof createTestDb>>
beforeEach(async () => { t = await createTestDb() })
afterEach(() => t.cleanup())

test('retorna fallback quando não existe', async () => {
  expect(await getSetting(t.db, 'nearDueDays', 7)).toBe(7)
})

test('roundtrip JSON de objetos e sobrescrita', async () => {
  await setSetting(t.db, 'week.filters', { companyIds: [1, 2], includeDone: false })
  expect(await getSetting(t.db, 'week.filters', {})).toEqual({ companyIds: [1, 2], includeDone: false })
  await setSetting(t.db, 'theme', 'dark')
  await setSetting(t.db, 'theme', 'light')
  expect(await getAllSettings(t.db)).toMatchObject({ theme: 'light', nearDueDays: 7, weekStartsOn: 1 })
})
