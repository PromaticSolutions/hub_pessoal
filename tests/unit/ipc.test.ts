import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod'
import { dispatch, h } from '@main/ipc/registry'
import { AppError } from '@main/lib/errors'
import { logActivity } from '@main/lib/activity'
import { createTestDb } from '../helpers/db'

let t: ReturnType<typeof createTestDb>
beforeEach(() => { t = createTestDb() })
afterEach(() => t.cleanup())
const ctx = () => ({ db: t.db, paths: t.paths, now: () => new Date() })

const handlers = {
  'x.echo': h(z.object({ n: z.number() }), (_c, i) => i.n * 2),
  'x.missing': h(z.object({}), () => { throw new AppError('NOT_FOUND', 'Não encontrado') }),
  'x.boom': h(z.object({}), () => { throw new Error('secret stack detail') })
}

test('dispatch retorna dados em caso de sucesso', async () => {
  expect(await dispatch(handlers, ctx(), 'x.echo', { n: 2 })).toEqual({ ok: true, data: 4 })
})

test('dispatch retorna VALIDATION para input inválido', async () => {
  const r = await dispatch(handlers, ctx(), 'x.echo', { n: 'a' })
  expect(r).toMatchObject({ ok: false, error: { code: 'VALIDATION' } })
})

test('dispatch retorna NOT_FOUND quando o handler lança AppError', async () => {
  expect(await dispatch(handlers, ctx(), 'x.missing', {})).toEqual({ ok: false, error: { code: 'NOT_FOUND', message: 'Não encontrado' } })
})

test('dispatch retorna INTERNAL sem vazar detalhes e registra em log', async () => {
  const r = await dispatch(handlers, ctx(), 'x.boom', {})
  expect(r).toMatchObject({ ok: false, error: { code: 'INTERNAL' } })
  expect(JSON.stringify(r)).not.toContain('secret stack detail')
  const log = join(t.paths.logs, 'main.log')
  expect(existsSync(log) && readFileSync(log, 'utf8')).toContain('secret stack detail')
})

test('método desconhecido retorna NOT_FOUND', async () => {
  expect(await dispatch(handlers, ctx(), 'nope', {})).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } })
})

test('logActivity grava old/new serializados', () => {
  t.db.exec("INSERT INTO projects(company_id, name, color) VALUES (1, 'P', '#000')")
  logActivity(t.db, { entityType: 'project', entityId: 1, action: 'updated', field: 'dates', oldValue: { a: 1 }, newValue: 'x' })
  const row = t.db.prepare('SELECT * FROM activity_log').get() as Record<string, unknown>
  expect(row).toMatchObject({ entity_type: 'project', entity_id: 1, action: 'updated', field: 'dates', old_value: '{"a":1}', new_value: 'x', task_id: null })
})
