import { createElement as h } from 'react'
import { parseOptions } from '../../src/renderer/components/select-options'

test('lê options simples, sem value e desabilitadas', () => {
  const items = parseOptions([
    h('option', { key: 1, value: 'a' }, 'Alfa'),
    h('option', { key: 2 }, 'Beta'),
    h('option', { key: 3, value: 3, disabled: true }, 'Gama')
  ])
  expect(items).toEqual([
    { kind: 'option', value: 'a', label: 'Alfa' },
    { kind: 'option', value: 'Beta', label: 'Beta' },
    { kind: 'option', value: '3', label: 'Gama', disabled: true }
  ])
})

test('lê optgroup e conteúdo misto ({} e arrays)', () => {
  const items = parseOptions([
    h('option', { key: 0, value: '' }, 'Todos'),
    [h('option', { key: 1, value: 'x' }, 'X ', 'mais')],
    h('optgroup', { key: 2, label: 'Espaço' }, h('option', { value: 'c:1' }, 'Pessoal'), h('option', { value: 'c:2' }, 'Empresa A')),
    null,
    false
  ])
  expect(items).toEqual([
    { kind: 'option', value: '', label: 'Todos' },
    { kind: 'option', value: 'x', label: 'X mais' },
    { kind: 'group', label: 'Espaço' },
    { kind: 'option', value: 'c:1', label: 'Pessoal' },
    { kind: 'option', value: 'c:2', label: 'Empresa A' }
  ])
})
