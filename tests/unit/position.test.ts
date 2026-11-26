import { positionBetween, needsRenormalize, renormalize, positionForInsert } from '@server/lib/position'
import { logActivity } from '@server/lib/activity'
import { createTestDb } from '../helpers/db'

test('positionBetween casos base', () => {
  expect(positionBetween(null, null)).toBe(1024)
  expect(positionBetween(1024, null)).toBe(2048)
  expect(positionBetween(null, 1024)).toBe(512)
  expect(positionBetween(1024, 2048)).toBe(1536)
})

test('mantém ordem estrita em 60 inserções no mesmo ponto com renormalização', async () => {
  const t = await createTestDb()
  const db = t.db
  await db.exec("INSERT INTO projects(company_id, name, color) VALUES (1, 'P', '#000')")
  await db.exec("INSERT INTO boards(project_id, name) VALUES (1, 'B')")
  await db.exec("INSERT INTO columns(board_id, name, position) VALUES (1, 'A', 1024), (1, 'Z', 2048)")
  // Always insert right after 'A' (between A and its current next sibling)
  const names: string[] = []
  for (let i = 0; i < 60; i++) {
    const rows = await db.many<{ id: number; position: number }>('SELECT id, position FROM columns WHERE board_id = 1 ORDER BY position')
    let before = rows[0].position
    let after = rows[1].position
    if (needsRenormalize(before, after)) {
      await renormalize(db, 'columns', 'board_id = ?', [1])
      const r2 = await db.many<{ position: number }>('SELECT position FROM columns WHERE board_id = 1 ORDER BY position')
      before = r2[0].position
      after = r2[1].position
    }
    const name = `n${i}`
    names.push(name)
    await db.run('INSERT INTO columns(board_id, name, position) VALUES (1, ?, ?)', [name, positionBetween(before, after)])
  }
  const final = await db.many<{ name: string; position: number }>('SELECT name, position FROM columns WHERE board_id = 1 ORDER BY position')
  expect(final.map((r) => r.name)).toEqual(['A', ...names.reverse(), 'Z'])
  for (let i = 1; i < final.length; i++) expect(final[i].position).toBeGreaterThan(final[i - 1].position)
  await t.cleanup()
})

test('positionForInsert: fim do escopo, entre irmãos e renormaliza quando o vão acaba', async () => {
  const t = await createTestDb()
  const db = t.db
  await db.exec("INSERT INTO projects(company_id, name, color) VALUES (1, 'P', '#000')")
  await db.exec("INSERT INTO boards(project_id, name) VALUES (1, 'B')")
  expect(await positionForInsert(db, 'columns', 'board_id = ?', [1], null, null)).toBe(1024)
  await db.exec("INSERT INTO columns(id, board_id, name, position) VALUES (10, 1, 'A', 1024), (11, 1, 'B', 1024.0000000001)")
  expect(await positionForInsert(db, 'columns', 'board_id = ?', [1], null, null)).toBe(1024.0000000001 + 1024)
  const p = await positionForInsert(db, 'columns', 'board_id = ?', [1], 10, 11)
  expect(await db.many('SELECT id, position FROM columns ORDER BY id')).toEqual([{ id: 10, position: 1024 }, { id: 11, position: 2048 }])
  expect(p).toBe(1536)
  await t.cleanup()
})

test('logActivity grava com data padrão ISO ou a informada', async () => {
  const t = await createTestDb()
  await logActivity(t.db, { entityType: 'project', entityId: 3, action: 'update', field: 'name', oldValue: 'a', newValue: { x: 1 } })
  await logActivity(t.db, { entityType: 'company', entityId: 1, action: 'create', at: '2026-11-25T15:00:00.000Z' })
  const rows = await t.db.many('SELECT entity_type, entity_id, task_id, action, field, old_value, new_value, created_at FROM activity_log ORDER BY id')
  expect(rows).toEqual([
    { entity_type: 'project', entity_id: 3, task_id: null, action: 'update', field: 'name', old_value: 'a', new_value: '{"x":1}', created_at: expect.stringMatching(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/) },
    { entity_type: 'company', entity_id: 1, task_id: null, action: 'create', field: null, old_value: null, new_value: null, created_at: '2026-11-25T15:00:00.000Z' }
  ])
  await t.cleanup()
})
