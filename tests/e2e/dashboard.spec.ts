import { test, expect } from '@playwright/test'
import { invoke, launchApp, makeTempDir } from '../helpers/app'

test('dashboard reflete alterações sem recarregar', async () => {
  const { app, page } = await launchApp(makeTempDir('pth-dash-'))
  const p = await invoke(page, 'projects.create', { companyId: 1, folderId: null, name: 'P', color: '#000' })
  await invoke(page, 'tasks.quickCreate', { projectId: p.id, title: 'Normal' })
  const late = await invoke(page, 'tasks.quickCreate', { projectId: p.id, title: 'Atrasada', dueAt: '2020-01-01' })
  await page.getByTestId('nav-week').click()
  await page.getByTestId('nav-dashboard').click()
  await expect(page.getByTestId('kpi-total')).toHaveText('2')
  await expect(page.getByTestId('kpi-overdue')).toHaveText('1')
  await page.getByTestId('list-overdue').getByText('Atrasada', { exact: true }).click()
  await expect(page.getByTestId('task-modal')).toBeVisible()
  await page.getByTestId('task-status').selectOption('done')
  await page.getByTestId('task-modal-close').click()
  await expect(page.getByTestId('kpi-overdue')).toHaveText('0')
  await expect(page.getByTestId('kpi-done')).toHaveText('1')
  void late
  await app.close()
})
