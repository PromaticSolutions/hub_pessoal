import { positionBetween, needsRenormalize, renormalize } from '@main/lib/position'
import { createTestDb } from '../helpers/db'

test('positionBetween casos base', () => {
  expect(positionBetween(null, null)).toBe(1024)
  expect(positionBetween(1024, null)).toBe(2048)
  expect(positionBetween(null, 1024)).toBe(512)
  expect(positionBetween(1024, 2048)).toBe(1536)
})

test('mantém ordem estrita em 60 inserções no mesmo ponto com renormalização', () => {
  const t = createTestDb()
  const db = t.db
  db.exec("INSERT INTO projects(company_id, name, color) VALUES (1, 'P', '#000')")
  db.exec("INSERT INTO boards(project_id, name) VALUES (1, 'B')")
  db.exec("INSERT INTO columns(board_id, name, position) VALUES (1, 'A', 1024), (1, 'Z', 2048)")
  // Always insert right after 'A' (between A and its current next sibling)
  const names: string[] = []
  for (let i = 0; i < 60; i++) {
    const rows = db.prepare('SELECT id, position FROM columns WHERE board_id = 1 ORDER BY position').all() as { id: number; position: number }[]
    let before = rows[0].position
    let after = rows[1].position
    if (needsRenormalize(before, after)) {
      renormalize(db, 'columns', 'board_id = ?', [1])
      const r2 = db.prepare('SELECT position FROM columns WHERE board_id = 1 ORDER BY position').all() as { position: number }[]
      before = r2[0].position
      after = r2[1].position
    }
    const name = `n${i}`
    names.push(name)
    db.prepare('INSERT INTO columns(board_id, name, position) VALUES (1, ?, ?)').run(name, positionBetween(before, after))
  }
  const final = db.prepare('SELECT name, position FROM columns WHERE board_id = 1 ORDER BY position').all() as { name: string; position: number }[]
  expect(final.map((r) => r.name)).toEqual(['A', ...names.reverse(), 'Z'])
  for (let i = 1; i < final.length; i++) expect(final[i].position).toBeGreaterThan(final[i - 1].position)
  t.cleanup()
})
