import { computeDrop, computeColumnDrop } from '../../src/renderer/features/board/dnd'

const cols = { 1: [{ id: 10 }, { id: 11 }, { id: 12 }], 2: [] as { id: number }[] }

test('mesmo lugar mantém vizinhos', () => {
  expect(computeDrop(cols, 11, 1, 1)).toEqual({ columnId: 1, beforeId: 10, afterId: 12 })
})
test('topo da coluna', () => {
  expect(computeDrop(cols, 12, 1, 0)).toEqual({ columnId: 1, beforeId: null, afterId: 10 })
})
test('fim da coluna', () => {
  expect(computeDrop(cols, 10, 1, 2)).toEqual({ columnId: 1, beforeId: 12, afterId: null })
})
test('coluna vazia', () => {
  expect(computeDrop(cols, 10, 2, 0)).toEqual({ columnId: 2, beforeId: null, afterId: null })
})
test('mover para baixo na mesma coluna', () => {
  expect(computeDrop(cols, 10, 1, 1)).toEqual({ columnId: 1, beforeId: 11, afterId: 12 })
})
test('colunas: mover primeira para o fim', () => {
  expect(computeColumnDrop([1, 2, 3], 1, 2)).toEqual({ beforeId: 3, afterId: null })
  expect(computeColumnDrop([1, 2, 3], 3, 0)).toEqual({ beforeId: null, afterId: 1 })
})
