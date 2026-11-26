import { test, expect } from '@playwright/test'
import { invoke, launchApp, makeTempDir } from '../helpers/app'

async function setupTask(page: import('@playwright/test').Page) {
  const p = await invoke(page, 'projects.create', { companyId: 1, folderId: null, name: 'P', color: '#000' })
  const t = await invoke(page, 'tasks.quickCreate', { projectId: p.id, title: 'Tarefa' })
  return { p, t }
}

test('texto digitado no modal sobrevive a fechar o app imediatamente', async () => {
  const dir = makeTempDir('pth-fix1-')
  let { app, page } = await launchApp(dir)
  const { p, t } = await setupTask(page)
  await page.evaluate(([pid, tid]) => { location.hash = `#/projects/${pid}?task=${tid}` }, [p.id, t.id])
  await page.getByTestId('task-description').fill('texto importante')
  await app.close()
  ;({ app, page } = await launchApp(dir))
  expect((await invoke(page, 'tasks.get', { id: t.id })).description).toBe('texto importante')
  await app.close()
})

test('editar item do checklist e apertar Esc salva a edição', async () => {
  const { app, page } = await launchApp(makeTempDir('pth-fix2-'))
  const { p, t } = await setupTask(page)
  const cl = await invoke(page, 'checklists.add', { taskId: t.id })
  await invoke(page, 'checklistItems.add', { checklistId: cl.id, text: 'old' })
  await page.evaluate(([pid, tid]) => { location.hash = `#/projects/${pid}?task=${tid}` }, [p.id, t.id])
  const input = page.getByTestId('task-modal').locator('input[value="old"]')
  await input.fill('new text')
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('task-modal')).toBeHidden()
  await expect.poll(async () => (await invoke(page, 'tasks.get', { id: t.id })).checklists[0].items[0].text).toBe('new text')
  await app.close()
})
