import { initialTabs, navigate, openTab, closeTab, activate, moveTab, cycle, activateIndex, isDashboardPath, stripTransient, HOME_TAB_ID, MAX_TABS, type TabsState } from '../../src/renderer/lib/tabs'

const paths = (s: TabsState) => s.tabs.map((t) => t.path)
const active = (s: TabsState) => s.tabs.find((t) => t.id === s.activeId)!

test('initialTabs garante a aba fixa e usa lastRoute sem estado salvo', () => {
  expect(initialTabs(undefined)).toEqual({ tabs: [{ id: HOME_TAB_ID, path: '/', pinned: true }], activeId: HOME_TAB_ID })
  const s = initialTabs(null, '/calendar')
  expect(paths(s)).toEqual(['/', '/calendar'])
  expect(active(s).path).toBe('/calendar')
  const saved = { tabs: [{ id: 'x', path: '/ideas' }], activeId: 'x' }
  const r = initialTabs(saved)
  expect(paths(r)).toEqual(['/', '/ideas'])
  expect(r.activeId).toBe('x')
  expect(initialTabs({ tabs: 'lixo' }).tabs).toHaveLength(1)
  expect(initialTabs({ tabs: [{ id: 'y', path: '/all' }], activeId: 'sumiu' }).activeId).toBe(HOME_TAB_ID)
})

test('navegar a partir da aba fixa abre nova aba; dashboard sempre volta à fixa', () => {
  let s = initialTabs(undefined)
  s = navigate(s, '/projects/1')
  expect(paths(s)).toEqual(['/', '/projects/1'])
  expect(active(s).path).toBe('/projects/1')
  s = navigate(s, '/projects/2')
  expect(paths(s)).toEqual(['/', '/projects/2'])
  s = navigate(s, '/?space=3')
  expect(s.activeId).toBe(HOME_TAB_ID)
  expect(active(s).path).toBe('/?space=3')
  expect(paths(s)).toEqual(['/?space=3', '/projects/2'])
  s = navigate(s, '/projects/2')
  expect(paths(s)).toEqual(['/?space=3', '/projects/2'])
  expect(active(s).path).toBe('/projects/2')
})

test('openTab reutiliza aba com mesmo caminho e insere à direita da ativa', () => {
  let s = initialTabs(undefined)
  s = openTab(s, '/a')
  s = openTab(s, '/b')
  s = activate(s, s.tabs[1].id)
  s = openTab(s, '/c')
  expect(paths(s)).toEqual(['/', '/a', '/c', '/b'])
  const before = s.tabs.length
  s = openTab(s, '/b')
  expect(s.tabs.length).toBe(before)
  expect(active(s).path).toBe('/b')
  s = openTab(s, '/d', { activate: false })
  expect(active(s).path).toBe('/b')
})

test('limite de abas remove a mais antiga não fixa e não ativa', () => {
  let s = initialTabs(undefined)
  for (let i = 0; i < MAX_TABS + 3; i++) s = openTab(s, `/p${i}`)
  expect(s.tabs.length).toBe(MAX_TABS)
  expect(s.tabs[0].id).toBe(HOME_TAB_ID)
  expect(paths(s)).not.toContain('/p0')
  expect(active(s).path).toBe(`/p${MAX_TABS + 2}`)
})

test('fechar: fixa não fecha; ativa passa para a direita, senão esquerda', () => {
  let s = initialTabs(undefined)
  s = openTab(s, '/a'); s = openTab(s, '/b'); s = openTab(s, '/c')
  expect(closeTab(s, HOME_TAB_ID)).toBe(s)
  const b = s.tabs[2].id
  s = activate(s, b)
  s = closeTab(s, b)
  expect(active(s).path).toBe('/c')
  s = closeTab(s, s.activeId)
  expect(active(s).path).toBe('/a')
})

test('mover, ciclar e ativar por índice; fixa fica na posição 0', () => {
  let s = initialTabs(undefined)
  s = openTab(s, '/a'); s = openTab(s, '/b')
  s = moveTab(s, s.tabs[2].id, 0)
  expect(paths(s)).toEqual(['/', '/b', '/a'])
  s = moveTab(s, HOME_TAB_ID, 2)
  expect(s.tabs[0].id).toBe(HOME_TAB_ID)
  s = activateIndex(s, 0)
  s = cycle(s, -1)
  expect(active(s).path).toBe('/a')
  s = cycle(s, 1)
  expect(s.activeId).toBe(HOME_TAB_ID)
  expect(activateIndex(s, 9)).toBe(s)
})

test('helpers de caminho', () => {
  expect(isDashboardPath('/')).toBe(true)
  expect(isDashboardPath('/?space=2')).toBe(true)
  expect(isDashboardPath('/all')).toBe(false)
  expect(stripTransient('/projects/1?task=5&view=list')).toBe('/projects/1?view=list')
  expect(stripTransient('/projects/1?task=5')).toBe('/projects/1')
})
