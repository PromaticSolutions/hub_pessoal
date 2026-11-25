import Database from 'better-sqlite3'

test('better-sqlite3 carrega no runtime do Electron', () => {
  const db = new Database(':memory:')
  expect(db.prepare('select sqlite_version() v').get()).toHaveProperty('v')
  expect(process.versions.electron).toBeDefined()
})
