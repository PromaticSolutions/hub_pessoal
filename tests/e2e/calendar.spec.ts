import { test, expect } from '@playwright/test'
import { invoke, launchApp, makeTempDir } from '../helpers/app'

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

test('calendário mostra tarefa, abre modal e reflete mudança de data', async () => {
  const { app, page } = await launchApp(makeTempDir('pth-cal-'))
  const p = await invoke(page, 'projects.create', { companyId: 1, folderId: null, name: 'P', color: '#000' })
  const now = new Date()
  const today = iso(now)
  const other = iso(new Date(now.getFullYear(), now.getMonth(), now.getDate() === 15 ? 16 : 15))
  const t = await invoke(page, 'tasks.quickCreate', { projectId: p.id, title: 'Reunião', dueAt: today })
  await page.getByTestId('nav-calendar').click()
  await page.getByTestId('cal-view-month').click()
  await expect(page.getByTestId(`cal-day-${today}`).getByTestId(`cal-item-due-${t.id}`)).toBeVisible()
  await page.getByTestId(`cal-item-due-${t.id}`).click()
  await expect(page.getByTestId('task-modal')).toBeVisible()
  await page.getByTestId('task-due').fill(other)
  await page.getByTestId('task-modal-close').click()
  await expect(page.getByTestId(`cal-day-${other}`).getByTestId(`cal-item-due-${t.id}`)).toBeVisible()
  await page.getByTestId('cal-view-week').click()
  await page.getByTestId('cal-view-day').click()
  await expect(page.getByTestId('cal-label')).not.toBeEmpty()
  await app.close()
})
