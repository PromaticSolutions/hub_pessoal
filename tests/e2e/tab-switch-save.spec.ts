import { test, expect } from '@playwright/test'
import { invoke, launchApp, makeTempDir } from '../helpers/app'

test('trocar de aba com Ctrl+Tab enquanto digita não perde o texto', async () => {
  const { app, page } = await launchApp(makeTempDir('pth-tabsave-'))
  const idea = await invoke(page, 'ideas.create', { title: 'Ideia' })
  await page.getByTestId('nav-ideas').click()
  await page.getByTestId(`idea-card-${idea.id}`).click()
  await page.getByTestId('idea-description').fill('texto que não pode sumir')
  await page.keyboard.press('Control+Tab')
  await expect.poll(async () => (await invoke(page, 'ideas.get', { id: idea.id })).description).toBe('texto que não pode sumir')
  await app.close()
})
