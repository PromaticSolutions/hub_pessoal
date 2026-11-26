import { test, expect } from '@playwright/test'
import { invoke, launchApp, makeTempDir, pick } from '../helpers/app'

test('dashboard personalizável: adicionar, configurar, remover, persistir e modelo financeiro', async () => {
  const dir = makeTempDir('pth-dash2-')
  let { app, page } = await launchApp(dir)
  const p = await invoke(page, 'projects.create', { companyId: 1, folderId: null, name: 'P', color: '#000' })
  await invoke(page, 'tasks.quickCreate', { projectId: p.id, title: 'Uma', priority: 'high' })
  await invoke(page, 'shopping.create', { name: 'Café', quantity: 2, priceCents: 1250 })
  await page.getByTestId('nav-week').click()
  await page.getByTestId('nav-dashboard').click()
  await expect(page.getByTestId('kpi-total')).toHaveText('1')
  const [geral] = await invoke(page, 'dashboards.list', {})
  const before = (await invoke(page, 'dashboards.get', { id: geral.id })).widgets.length

  await page.getByTestId('dashboard-edit').click()
  await page.getByTestId('widget-add').click()
  await pick(page, 'widget-type', 'chart')
  await pick(page, 'widget-chart', 'pie')
  await pick(page, 'widget-data', 'byPriority')
  await pick(page, 'widget-source', `c:1`)
  await page.getByTestId('widget-save').click()
  await expect.poll(async () => (await invoke(page, 'dashboards.get', { id: geral.id })).widgets.length).toBe(before + 1)
  const added = (await invoke(page, 'dashboards.get', { id: geral.id })).widgets.at(-1)
  expect(added).toMatchObject({ type: 'chart', config: { chart: 'pie', data: 'byPriority', source: { kind: 'scope', scope: { companyId: 1 } } } })
  await expect(page.getByTestId(`widget-${added.id}`)).toBeVisible()

  const first = (await invoke(page, 'dashboards.get', { id: geral.id })).widgets[0]
  await page.getByTestId(`widget-remove-${first.id}`).click()
  await page.getByTestId('confirm-ok').click()
  await expect(page.getByTestId(`widget-${first.id}`)).toHaveCount(0)
  await page.getByTestId('dashboard-edit-done').click()

  await page.getByTestId('dashboard-menu').click()
  await page.getByTestId('dashboard-new').click()
  await page.getByTestId('new-dashboard-name').fill('Financeiro')
  await pick(page, 'new-dashboard-template', 'financeiro')
  await page.getByTestId('new-dashboard-ok').click()
  await expect(page.getByTestId('kpi-shoppingPending')).toContainText('25,00')
  await app.close()

  ;({ app, page } = await launchApp(dir))
  const list = await invoke(page, 'dashboards.list', {})
  expect(list.map((d: { name: string }) => d.name)).toEqual(['Geral', 'Financeiro'])
  const g = await invoke(page, 'dashboards.get', { id: geral.id })
  expect(g.widgets.length).toBe(before)
  expect(g.widgets.some((w: { id: number }) => w.id === added.id)).toBe(true)
  await app.close()
})
