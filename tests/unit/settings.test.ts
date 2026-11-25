import { getSetting, setSetting, getAllSettings } from '@main/services/settings'
import { createTestDb } from '../helpers/db'

let t: ReturnType<typeof createTestDb>
beforeEach(() => { t = createTestDb() })
afterEach(() => t.cleanup())

test('retorna fallback quando não existe', () => {
  expect(getSetting(t.db, 'nearDueDays', 7)).toBe(7)
})

test('roundtrip JSON de objetos e sobrescrita', () => {
  setSetting(t.db, 'week.filters', { companyIds: [1, 2], includeDone: false })
  expect(getSetting(t.db, 'week.filters', {})).toEqual({ companyIds: [1, 2], includeDone: false })
  setSetting(t.db, 'theme', 'dark')
  setSetting(t.db, 'theme', 'light')
  expect(getAllSettings(t.db)).toMatchObject({ theme: 'light', nearDueDays: 7, weekStartsOn: 1 })
})
