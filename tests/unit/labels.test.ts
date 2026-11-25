import { listLabels, createLabel, updateLabel, deleteLabel } from '@main/services/labels'
import { createTestCtx } from '../helpers/ctx'

let T: ReturnType<typeof createTestCtx>
beforeEach(() => { T = createTestCtx() })
afterEach(() => T.cleanup())

test('cria, lista em ordem alfabética, edita e exclui etiquetas', () => {
  createLabel(T.ctx, { name: 'Cliente', color: '#f00' })
  const b = createLabel(T.ctx, { name: 'Bug', color: '#0f0' })
  expect(listLabels(T.ctx).map((l) => l.name)).toEqual(['Bug', 'Cliente'])
  expect(updateLabel(T.ctx, b.id, { name: 'Erro' }).name).toBe('Erro')
  deleteLabel(T.ctx, b.id)
  expect(listLabels(T.ctx).map((l) => l.name)).toEqual(['Cliente'])
})

test('nome duplicado (case-insensitive) → CONFLICT', () => {
  createLabel(T.ctx, { name: 'Cliente', color: '#f00' })
  expect(() => createLabel(T.ctx, { name: 'cliente', color: '#000' })).toThrow(expect.objectContaining({ code: 'CONFLICT' }))
})
