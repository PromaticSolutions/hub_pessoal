import { test, expect } from '@playwright/test'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { invoke, launchApp, makeTempDir, pick } from '../helpers/app'

test('modal do card: editar tudo, reiniciar e conferir', async () => {
  const dir = makeTempDir('pth-modal-')
  let { app, page } = await launchApp(dir)
  const project = await invoke(page, 'projects.create', { companyId: 1, folderId: null, name: 'Estudos', color: '#10B981' })
  const pd = await invoke(page, 'projects.get', { id: project.id })
  const board = await invoke(page, 'boards.get', { id: pd.boards[0].id })
  const task = await invoke(page, 'tasks.create', { columnId: board.columns[1].id, title: 'Ler livro' })
  await page.evaluate((id) => { location.hash = `#/projects/${id}` }, project.id)
  await page.getByTestId(`card-${task.id}`).click()
  await expect(page.getByTestId('task-modal')).toBeVisible()

  await page.getByTestId('task-title').fill('Ler livro de arquitetura')
  await page.getByTestId('task-description').fill('Capítulos **1 a 3**')
  await pick(page, 'task-priority', 'high')
  await page.getByTestId('task-due').fill('2026-12-05')
  await page.getByTestId('labels-button').click()
  await page.getByTestId('new-label-input').fill('Cliente')
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('task-modal').getByText('Cliente').first()).toBeVisible()
  await page.getByTestId('add-checklist').click()
  const cl = (await invoke(page, 'tasks.get', { id: task.id })).checklists[0]
  for (const text of ['Cap 1', 'Cap 2', 'Cap 3']) {
    await page.getByTestId(`checklist-new-${cl.id}`).fill(text)
    await page.keyboard.press('Enter')
    await expect(page.getByTestId('task-modal').locator(`input[value="${text}"]`)).toBeVisible()
  }
  const items = (await invoke(page, 'tasks.get', { id: task.id })).checklists[0].items
  await page.getByTestId(`check-item-${items[0].id}`).check()
  await page.getByTestId('comment-input').fill('Começar amanhã')
  await page.getByTestId('comment-send').click()
  await expect(page.getByText('Começar amanhã')).toBeVisible()
  const file = join(makeTempDir('pth-file-'), 'resumo final.txt')
  writeFileSync(file, 'conteúdo')
  await page.getByTestId('attach-input').setInputFiles(file)
  await expect(page.getByText('resumo final.txt')).toBeVisible()
  await page.getByTestId('task-modal-close').click()
  await expect(page.getByTestId('task-modal')).toBeHidden()
  await expect(page.getByTestId(`card-${task.id}`)).toContainText('1/3')
  await app.close()

  ;({ app, page } = await launchApp(dir))
  const t = await invoke(page, 'tasks.get', { id: task.id })
  expect(t).toMatchObject({ title: 'Ler livro de arquitetura', description: 'Capítulos **1 a 3**', priority: 'high', dueAt: '2026-12-05' })
  expect(t.labels.map((l: { name: string }) => l.name)).toEqual(['Cliente'])
  expect(t.checklists[0].items.map((i: { done: boolean }) => i.done)).toEqual([true, false, false])
  expect(t.comments[0].body).toBe('Começar amanhã')
  expect(t.attachments[0].originalName).toBe('resumo final.txt')
  await page.evaluate(([p, id]) => { location.hash = `#/projects/${p}?task=${id}` }, [project.id, task.id])
  await expect(page.getByTestId('task-modal')).toBeVisible()
  await page.getByTestId('tab-history').click()
  await expect(page.getByTestId('history-list')).toContainText('Prioridade: Média → Alta')
  await page.getByTestId('task-duplicate').click()
  await expect(page.getByTestId('toast-success')).toContainText('(cópia)')
  await app.close()
})
