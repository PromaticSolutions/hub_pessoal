import { test, expect, type Page } from '@playwright/test'
import { invoke, launchApp, makeTempDir } from '../helpers/app'

const tabByPath = (page: Page, path: string) => page.locator(`[role=tab][data-tab-path="${path}"]`)
const activePath = (page: Page) => page.locator('[role=tab][data-active]').getAttribute('data-tab-path')

test('abas: abrir, trocar, preservar contexto, fechar, persistir e projeto excluído', async () => {
  const dir = makeTempDir('pth-tabs-')
  let { app, page } = await launchApp(dir)
  const a = await invoke(page, 'projects.create', { companyId: 1, folderId: null, name: 'Alfa', color: '#0E9384' })
  const b = await invoke(page, 'projects.create', { companyId: 1, folderId: null, name: 'Beta', color: '#DC6803' })
  const b2 = await invoke(page, 'boards.create', { projectId: a.id, name: 'Sprint 2' })
  await page.getByTestId('nav-week').click() // from pinned Dashboard → new tab
  await expect(tabByPath(page, '/week')).toBeVisible()
  await expect(page.locator('[role=tab]')).toHaveCount(2)
  await page.getByTestId('tree-company-1').locator('button').first().click()
  await page.getByTestId(`tree-project-${a.id}`).getByText('Alfa').click() // navigates active tab (/week → Alfa)
  await expect(tabByPath(page, `/projects/${a.id}`)).toBeVisible()
  await expect(page.locator('[role=tab]')).toHaveCount(2)
  await page.getByTestId(`board-tab-${b2.id}`).click()
  await expect.poll(() => activePath(page)).toBe(`/projects/${a.id}/boards/${b2.id}`)
  await page.getByTestId(`tree-project-${b.id}`).getByText('Beta').click({ modifiers: ['Control'] }) // background tab
  await expect(tabByPath(page, `/projects/${b.id}`)).toBeVisible()
  await expect.poll(() => activePath(page)).toBe(`/projects/${a.id}/boards/${b2.id}`)
  await tabByPath(page, `/projects/${b.id}`).click()
  await expect(page.getByTestId('project-title')).toHaveValue('Beta')
  await tabByPath(page, `/projects/${a.id}/boards/${b2.id}`).click()
  await expect(page.getByTestId(`board-tab-${b2.id}`).locator('xpath=..')).toHaveClass(/surface/)
  await page.getByTestId('tab-new').click()
  await expect(tabByPath(page, '/all')).toBeVisible()
  const allTab = tabByPath(page, '/all')
  await allTab.locator('button[aria-label^="Fechar"]').click()
  await expect(allTab).toHaveCount(0)
  await page.waitForTimeout(400)
  await app.close()

  ;({ app, page } = await launchApp(dir))
  await expect(page.locator('[role=tab]')).toHaveCount(3)
  await expect(tabByPath(page, `/projects/${b.id}`)).toBeVisible()
  await tabByPath(page, `/projects/${a.id}/boards/${b2.id}`).click()
  await invoke(page, 'projects.delete', { id: b.id })
  const col = (await invoke(page, 'boards.get', { id: b2.id })).columns[0]
  await page.getByTestId(`quick-add-open-${col.id}`).click() // any UI mutation refreshes data
  await page.getByTestId(`quick-add-${col.id}`).fill('qualquer')
  await page.keyboard.press('Enter')
  await expect(tabByPath(page, `/projects/${b.id}`)).toContainText('Não encontrado')
  await tabByPath(page, `/projects/${b.id}`).hover()
  await tabByPath(page, `/projects/${b.id}`).locator('button[aria-label^="Fechar"]').click()
  await expect(tabByPath(page, `/projects/${b.id}`)).toHaveCount(0)
  await app.close()
})
