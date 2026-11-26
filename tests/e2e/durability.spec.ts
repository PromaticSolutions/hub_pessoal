import { test, expect } from '@playwright/test'
import { invoke, launchApp } from '../helpers/app'

test('dados confirmados sobrevivem a recarregar a página', async () => {
  const { app, page } = await launchApp()
  await invoke(page, 'settings.set', { key: 'probe', value: 42 })
  await page.reload()
  await page.getByTestId('nav-settings').waitFor()
  expect(await invoke(page, 'settings.get', { key: 'probe' })).toBe(42)
  await app.close()
})

test('duas abas do site ao mesmo tempo usam os mesmos dados', async () => {
  const { app, page } = await launchApp()
  const other = await page.context().newPage()
  await other.goto('/')
  await invoke(page, 'settings.set', { key: 'probe', value: 'a' })
  expect(await invoke(other, 'settings.get', { key: 'probe' })).toBe('a')
  await other.close()
  await app.close()
})
