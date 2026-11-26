import { test, expect } from '@playwright/test'
import { dragTo, invoke, launchApp, makeTempDir, pick } from '../helpers/app'

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

test('meu dia: alocar tarefa existente sem cópia, atividade livre, concluir reflete no dashboard, persistir', async () => {
  const dir = makeTempDir('pth-day-')
  let { app, page } = await launchApp(dir)
  const p = await invoke(page, 'projects.create', { companyId: 1, folderId: null, name: 'Projeto CRM', color: '#0E9384' })
  const t = await invoke(page, 'tasks.quickCreate', { projectId: p.id, title: 'Desenvolver integração CRM', dueAt: iso(new Date(Date.now() + 3 * 86400000)) })
  const other = await invoke(page, 'tasks.quickCreate', { projectId: p.id, title: 'Outra tarefa' })
  const countBefore = (await invoke(page, 'tasks.query', { filter: { includeArchived: true }, sort: 'due' })).length
  await page.getByTestId('nav-day').click()
  await page.getByTestId(`allocate-btn-${t.id}`).click()
  await pick(page, 'block-start', '09:00')
  await pick(page, 'block-end', '10:30')
  await page.getByTestId('block-save').click()
  const today = iso(new Date())
  let blocks = await invoke(page, 'dayBlocks.list', { date: today })
  expect(blocks).toHaveLength(1)
  expect(blocks[0]).toMatchObject({ taskId: t.id, startTime: '09:00', endTime: '10:30' })
  await expect(page.getByTestId(`day-block-${blocks[0].id}`)).toContainText('Projeto CRM')
  expect((await invoke(page, 'tasks.query', { filter: { includeArchived: true }, sort: 'due' })).length).toBe(countBefore)

  await page.getByTestId('day-add').click()
  await page.getByTestId('block-kind-activity').click()
  await page.getByTestId('block-title').fill('Almoço')
  await pick(page, 'block-start', '12:00')
  await pick(page, 'block-end', '13:00')
  await page.getByTestId('block-save').click()
  await expect(page.getByTestId('day-progress')).toContainText('0/2')

  // drag another task from the panel onto the timeline
  await dragTo(page, `[data-testid=allocate-item-${other.id}] button[aria-label^="Arrastar"]`, '[data-testid=day-timeline]', { yOffset: 200 })
  await expect.poll(async () => (await invoke(page, 'dayBlocks.list', { date: today })).length).toBe(3)

  blocks = await invoke(page, 'dayBlocks.list', { date: today })
  const taskBlock = blocks.find((b: { taskId: number }) => b.taskId === t.id)
  await page.getByTestId(`day-block-${taskBlock.id}`).locator('input[type=checkbox]').check()
  await expect(page.getByTestId('day-progress')).toContainText('1/3')
  expect((await invoke(page, 'tasks.get', { id: t.id })).status).toBe('done')
  await page.getByTestId('nav-dashboard').click()
  await expect(page.getByTestId('kpi-done')).toHaveText('1')
  await app.close()

  ;({ app, page } = await launchApp(dir))
  expect(await invoke(page, 'dayBlocks.list', { date: today })).toHaveLength(3)
  const tg = await invoke(page, 'tasks.get', { id: other.id })
  expect(tg.scheduled.length).toBe(1)
  await app.close()
})
