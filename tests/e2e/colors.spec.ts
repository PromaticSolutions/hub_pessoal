import { test, expect } from '@playwright/test'
import { invoke, launchApp, makeTempDir } from '../helpers/app'

test('cores de coluna, quadro e cartão persistem', async () => {
  const dir = makeTempDir('pth-colors-')
  let { app, page } = await launchApp(dir)
  const p = await invoke(page, 'projects.create', { companyId: 1, folderId: null, name: 'Cores', color: '#000' })
  const pd = await invoke(page, 'projects.get', { id: p.id })
  const boardId = pd.boards[0].id
  const board = await invoke(page, 'boards.get', { id: boardId })
  const col = board.columns[0]
  const t = await invoke(page, 'tasks.create', { columnId: col.id, title: 'Colorido' })
  await page.evaluate((id) => { location.hash = `#/projects/${id}` }, p.id)
  await page.getByTestId(`column-menu-${col.id}`).click()
  await page.getByTestId(`column-color-${col.id}`).click()
  await page.getByTestId('color-choice-0EA5E9').click()
  await expect(page.getByTestId(`column-${col.id}`)).toHaveAttribute('style', /color-mix/)
  await page.getByTestId(`board-tab-${boardId}`).hover()
  await page.getByTestId(`board-tab-${boardId}`).locator('xpath=..').locator('button').last().click({ force: true })
  await page.getByTestId(`board-color-${boardId}`).click()
  await page.getByTestId('color-choice-F97316').click()
  await page.getByTestId(`card-${t.id}`).click()
  await page.getByTestId('task-color-EC4899').click()
  await page.getByTestId('task-modal-close').click()
  await app.close()
  ;({ app, page } = await launchApp(dir))
  const b = await invoke(page, 'boards.get', { id: boardId })
  expect(b.board.color).toBe('#F97316')
  expect(b.columns[0].color).toBe('#0EA5E9')
  expect(b.cards[0].color).toBe('#EC4899')
  await app.close()
})
