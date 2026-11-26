import { z } from 'zod'
import { dispatch, h } from '@server/api/registry'
import { AppError } from '@server/lib/errors'
import { logActivity } from '@server/lib/activity'
import { createTestCtx } from '../helpers/ctx'

let T: Awaited<ReturnType<typeof createTestCtx>>
beforeEach(async () => { T = await createTestCtx() })
afterEach(() => T.cleanup())
const ctx = () => T.ctx

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
  const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
  try {
    const r = await dispatch(handlers, ctx(), 'x.boom', {})
    expect(r).toMatchObject({ ok: false, error: { code: 'INTERNAL' } })
    expect(JSON.stringify(r)).not.toContain('secret stack detail')
    expect(spy.mock.calls.map((c) => c.join(' ')).join('\n')).toContain('secret stack detail')
  } finally {
    spy.mockRestore()
  }
})

test('método desconhecido retorna NOT_FOUND', async () => {
  expect(await dispatch(handlers, ctx(), 'nope', {})).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } })
})

test('logActivity grava old/new serializados', async () => {
  await T.ctx.db.exec("INSERT INTO projects(company_id, name, color) VALUES (1, 'P', '#000')")
  await logActivity(T.ctx.db, { entityType: 'project', entityId: 1, action: 'updated', field: 'dates', oldValue: { a: 1 }, newValue: 'x' })
  const row = (await T.ctx.db.one('SELECT * FROM activity_log'))!
  expect(row).toMatchObject({ entity_type: 'project', entity_id: 1, action: 'updated', field: 'dates', old_value: '{"a":1}', new_value: 'x', task_id: null })
})
