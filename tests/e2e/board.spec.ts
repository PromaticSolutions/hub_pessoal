import { test, expect } from '@playwright/test'
import { dragTo, invoke, launchApp, makeTempDir } from '../helpers/app'

type Board = { columns: { id: number; name: string }[]; cards: { id: number; columnId: number }[] }
const order = (b: Board) => Object.fromEntries(b.columns.map((c) => [c.name, b.cards.filter((x) => x.columnId === c.id).map((x) => x.id)]))

test('quadro com 200 cartões: arrastar, reordenar e persistir após reiniciar', async () => {
  const dir = makeTempDir('pth-board-')
  let { app, page } = await launchApp(dir)
  const project = await invoke(page, 'projects.create', { companyId: 1, folderId: null, name: 'Kanban', color: '#0EA5E9' })
  const pd = await invoke(page, 'projects.get', { id: project.id })
  const boardId = pd.boards[0].id
  let board: Board = await invoke(page, 'boards.get', { id: boardId })
  const [backlog, afazer, andamento] = board.columns
  for (let i = 0; i < 200; i++) await invoke(page, 'tasks.create', { columnId: [backlog, afazer, andamento][i % 3].id, title: `Tarefa ${i + 1}` })
  await page.evaluate((id) => { location.hash = `#/projects/${id}` }, project.id)
  board = await invoke(page, 'boards.get', { id: boardId })
  const first = board.cards.find((c) => c.columnId === backlog.id)!
  await expect(page.getByTestId(`card-${first.id}`)).toBeVisible()

  // 1) card from Backlog to "Em andamento" (column body end)
  await dragTo(page, `[data-testid=card-${first.id}]`, `[data-testid=column-title-${andamento.id}]`, { yOffset: 60 })
  board = await invoke(page, 'boards.get', { id: boardId })
  expect(board.cards.find((c) => c.id === first.id)!.columnId).toBe(andamento.id)

  // 2) second card of "A fazer" to the top of "A fazer"
  const afList = board.cards.filter((c) => c.columnId === afazer.id)
  await dragTo(page, `[data-testid=card-${afList[1].id}]`, `[data-testid=card-${afList[0].id}]`, { yOffset: 2 })
  board = await invoke(page, 'boards.get', { id: boardId })
  expect(board.cards.filter((c) => c.columnId === afazer.id)[0].id).toBe(afList[1].id)

  // 3) move the third column ("Em andamento") before the first one
  const last = board.columns[2]
  await dragTo(page, `[data-testid=column-title-${last.id}]`, `[data-testid=column-title-${board.columns[0].id}]`)
  board = await invoke(page, 'boards.get', { id: boardId })
  expect(board.columns[0].id).toBe(last.id)

  const before = order(board)
  const colOrder = board.columns.map((c) => c.id)
  await app.close()
  ;({ app, page } = await launchApp(dir))
  const after: Board = await invoke(page, 'boards.get', { id: boardId })
  expect(order(after)).toEqual(before)
  expect(after.columns.map((c) => c.id)).toEqual(colOrder)
  expect(after.cards).toHaveLength(200)
  await app.close()
})

test('quick add, renomear coluna e excluir coluna movendo cartões', async () => {
  const { app, page } = await launchApp(makeTempDir('pth-board2-'))
  const project = await invoke(page, 'projects.create', { companyId: 1, folderId: null, name: 'P', color: '#000' })
  const pd = await invoke(page, 'projects.get', { id: project.id })
  const boardId = pd.boards[0].id
  let board: Board = await invoke(page, 'boards.get', { id: boardId })
  const col = board.columns[0]
  await page.evaluate((id) => { location.hash = `#/projects/${id}` }, project.id)
  await page.getByTestId(`quick-add-open-${col.id}`).click()
  await page.getByTestId(`quick-add-${col.id}`).fill('Primeira')
  await page.keyboard.press('Enter')
  await page.getByTestId(`quick-add-${col.id}`).fill('Segunda')
  await page.keyboard.press('Enter')
  await expect(page.getByText('Segunda')).toBeVisible()
  await page.getByTestId(`column-title-${col.id}`).dblclick()
  await page.getByTestId(`column-name-input-${col.id}`).fill('Ideias')
  await page.keyboard.press('Enter')
  await expect(page.getByTestId(`column-title-${col.id}`)).toContainText('Ideias')
  await page.getByTestId(`column-menu-${col.id}`).click()
  await page.getByTestId(`column-delete-${col.id}`).click()
  await page.getByTestId('delete-column-ok').click()
  board = await invoke(page, 'boards.get', { id: boardId })
  expect(board.columns.find((c) => c.id === col.id)).toBeUndefined()
  expect(board.cards.filter((c) => c.columnId === board.columns[0].id)).toHaveLength(2)
  await app.close()
})
