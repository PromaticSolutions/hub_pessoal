import { test, expect } from '@playwright/test'
import { launchApp, makeTempDir } from '../helpers/app'

test('abre a janela principal', async () => {
  const { app, page } = await launchApp(makeTempDir('pth-e2e-'))
  await expect(page).toHaveTitle('Personal Task Hub')
  await app.close()
})
