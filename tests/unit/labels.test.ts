import { listLabels, createLabel, updateLabel, deleteLabel } from '@server/services/labels'
import { createTestCtx } from '../helpers/ctx'

let T: Awaited<ReturnType<typeof createTestCtx>>
beforeEach(async () => { T = await createTestCtx() })
afterEach(() => T.cleanup())

test('cria, lista em ordem alfabética, edita e exclui etiquetas', async () => {
  await createLabel(T.ctx, { name: 'Cliente', color: '#f00' })
  const b = await createLabel(T.ctx, { name: 'Bug', color: '#0f0' })
  expect((await listLabels(T.ctx)).map((l) => l.name)).toEqual(['Bug', 'Cliente'])
  expect((await updateLabel(T.ctx, b.id, { name: 'Erro' })).name).toBe('Erro')
  await deleteLabel(T.ctx, b.id)
  expect((await listLabels(T.ctx)).map((l) => l.name)).toEqual(['Cliente'])
})

test('nome duplicado (case-insensitive) → CONFLICT', async () => {
  await createLabel(T.ctx, { name: 'Cliente', color: '#f00' })
  await expect(createLabel(T.ctx, { name: 'cliente', color: '#000' })).rejects.toMatchObject({ code: 'CONFLICT' })
})
