import { test, expect } from '@playwright/test'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { invoke, launchApp, makeTempDir, pick } from '../helpers/app'

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

test('fluxo completo: empresa → projeto → tarefas → visões refletem → reabrir idêntico', async () => {
  const dir = makeTempDir('pth-accept-')
  let { app, page } = await launchApp(dir)

  // empresa e projeto pela interface
  await page.getByTestId('nav-companies').click()
  await page.getByTestId('new-company').click()
  await page.getByTestId('company-name').fill('Empresa A')
  await page.getByTestId('company-save').click()
  await page.getByTestId('space-new-project').click()
  await page.getByTestId('project-name').fill('Projeto CRM')
  await page.getByTestId('project-save').click()
  await expect(page.getByTestId('project-title')).toHaveValue('Projeto CRM')
  const projectId = Number((await page.evaluate(() => location.hash)).match(/projects\/(\d+)/)![1])
  const pd = await invoke(page, 'projects.get', { id: projectId })
  const board = await invoke(page, 'boards.get', { id: pd.boards[0].id })
  const todo = board.columns[1]

  // 5 tarefas pelo quick add
  for (let i = 1; i <= 5; i++) {
    if (i === 1) await page.getByTestId(`quick-add-open-${todo.id}`).click()
    await page.getByTestId(`quick-add-${todo.id}`).fill(`Tarefa ${i}`)
    await page.keyboard.press('Enter')
    await expect(page.getByText(`Tarefa ${i}`, { exact: true })).toBeVisible()
  }
  await page.keyboard.press('Escape')
  const cards = (await invoke(page, 'boards.get', { id: board.board.id })).cards
  const today = iso(new Date())
  const yesterday = iso(new Date(Date.now() - 86400000))
  const label = await invoke(page, 'labels.create', { name: 'CRM', color: '#0EA5E9' })

  // detalhes via modal na primeira tarefa
  await page.getByTestId(`card-${cards[0].id}`).click()
  await pick(page, 'task-priority', 'urgent')
  await page.getByTestId('task-due').fill(today)
  await page.getByTestId('add-checklist').click()
  const cl = (await invoke(page, 'tasks.get', { id: cards[0].id })).checklists[0]
  await page.getByTestId(`checklist-new-${cl.id}`).fill('Levantar requisitos')
  await page.keyboard.press('Enter')
  await page.getByTestId('comment-input').fill('Falar com o time comercial')
  await page.getByTestId('comment-send').click()
  const f = join(makeTempDir('pth-acc-src-'), 'escopo.pdf')
  writeFileSync(f, '%PDF-1.4 fake')
  await page.getByTestId('attach-input').setInputFiles(f)
  await expect(page.getByText('escopo.pdf')).toBeVisible()
  await page.getByTestId('task-modal-close').click()
  await invoke(page, 'tasks.setLabels', { id: cards[0].id, labelIds: [label.id] })
  await invoke(page, 'tasks.update', { id: cards[1].id, dueAt: yesterday, priority: 'high' })
  await invoke(page, 'tasks.update', { id: cards[2].id, dueAt: today })

  // concluir a tarefa atrasada pelo modal
  await page.getByTestId('nav-dashboard').click()
  await expect(page.getByTestId('kpi-total')).toHaveText('5')
  await expect(page.getByTestId('kpi-overdue')).toHaveText('1')
  await page.getByTestId('list-overdue').getByText('Tarefa 2', { exact: true }).click()
  await pick(page, 'task-status', 'done')
  await page.getByTestId('task-modal-close').click()
  await expect(page.getByTestId('kpi-overdue')).toHaveText('0')
  await expect(page.getByTestId('kpi-done')).toHaveText('1')

  // minha semana e calendário
  await page.getByTestId('nav-week').click()
  await expect(page.getByTestId(`week-col-${today}`).getByTestId(`week-item-${cards[0].id}`)).toBeVisible()
  await page.getByTestId('nav-calendar').click()
  await page.getByTestId('cal-view-month').click()
  await expect(page.getByTestId(`cal-day-${today}`).getByTestId(`cal-item-due-${cards[2].id}`)).toBeVisible()

  // busca
  await page.keyboard.press('Control+k')
  await page.getByTestId('palette-input').fill('comercial')
  await expect(page.getByTestId('command-palette')).toContainText('Falar com o time')
  await page.keyboard.press('Escape')

  const snapshot = async () => ({
    board: (await invoke(page, 'boards.get', { id: board.board.id })).cards.map((c: { id: number; columnId: number; title: string; priority: string; dueAt: string }) => [c.id, c.columnId, c.title, c.priority, c.dueAt]),
    detail: await invoke(page, 'tasks.get', { id: cards[0].id }),
    dash: (await invoke(page, 'dashboard.get', { scope: 'all' })).kpis
  })
  const before = await snapshot()
  await app.close()

  ;({ app, page } = await launchApp(dir))
  const after = await snapshot()
  expect(after.board).toEqual(before.board)
  expect(after.detail).toEqual(before.detail)
  expect(after.dash).toEqual(before.dash)
  expect(after.detail.attachments[0].originalName).toBe('escopo.pdf')
  await app.close()
})
