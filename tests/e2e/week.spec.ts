import { test, expect } from '@playwright/test'
import { invoke, launchApp, makeTempDir, pick } from '../helpers/app'

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

test('minha semana mostra hoje, atrasadas, filtra por projeto e cria tarefa', async () => {
  const { app, page } = await launchApp(makeTempDir('pth-week-'))
  const a = await invoke(page, 'projects.create', { companyId: 1, folderId: null, name: 'Casa', color: '#000' })
  const b = await invoke(page, 'projects.create', { companyId: 1, folderId: null, name: 'Estudo', color: '#000' })
  const today = iso(new Date())
  const old = iso(new Date(Date.now() - 10 * 86400000))
  const t1 = await invoke(page, 'tasks.quickCreate', { projectId: a.id, title: 'Hoje casa', dueAt: today })
  const t2 = await invoke(page, 'tasks.quickCreate', { projectId: b.id, title: 'Atrasada estudo', dueAt: old })
  await page.getByTestId('nav-week').click()
  await expect(page.getByTestId(`week-col-${today}`).getByTestId(`week-item-${t1.id}`)).toBeVisible()
  await expect(page.getByTestId('week-col-overdue').getByTestId(`week-item-${t2.id}`)).toBeVisible()
  await pick(page, 'filter-project', String(a.id))
  await expect(page.getByTestId(`week-item-${t2.id}`)).toBeHidden()
  await page.getByTestId('week-new-task').click()
  await page.getByTestId('quick-title').fill('Nova pela semana')
  await page.getByTestId('quick-save').click()
  await expect(page.getByTestId('quick-create')).toBeHidden()
  const all = await invoke(page, 'tasks.query', { filter: {}, sort: 'due' })
  expect(all.map((t: { title: string }) => t.title)).toContain('Nova pela semana')
  await page.getByTestId(`week-item-${t1.id}`).locator('input[type=checkbox]').check()
  await expect.poll(async () => (await invoke(page, 'tasks.get', { id: t1.id })).status).toBe('done')
  await app.close()
})
