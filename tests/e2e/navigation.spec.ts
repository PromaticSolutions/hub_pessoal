import { test, expect } from '@playwright/test'
import { launchApp, makeTempDir, pick } from '../helpers/app'

test('navega por todas as áreas e restaura última rota e tema', async () => {
  const dir = makeTempDir('pth-nav-')
  let { app, page } = await launchApp(dir)
  const pages: [string, string][] = [
    ['nav-week', 'Minha semana'],
    ['nav-calendar', 'Calendário'],
    ['nav-files', 'Arquivos'],
    ['nav-companies', 'Empresas'],
    ['nav-dashboard', 'Dashboard'],
    ['nav-settings', 'Configurações']
  ]
  for (const [id, title] of pages) {
    await page.getByTestId(id).click()
    await expect(page.getByTestId('page-title')).toContainText(title)
  }
  await pick(page, 'theme-select', 'dark')
  await expect(page.locator('html')).toHaveClass(/dark/)
  await page.getByTestId('nav-calendar').click()
  await expect(page.getByTestId('page-title')).toContainText('Calendário')
  await page.waitForTimeout(300)
  await app.close()
  ;({ app, page } = await launchApp(dir))
  await expect(page.getByTestId('page-title')).toContainText('Calendário')
  await expect(page.locator('html')).toHaveClass(/dark/)
  await app.close()
})
