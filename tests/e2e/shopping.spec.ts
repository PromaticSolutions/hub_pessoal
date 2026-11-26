import { test, expect } from '@playwright/test'
import { invoke, launchApp, makeTempDir } from '../helpers/app'

const norm = (s: string | null) => (s ?? '').replace(/\s/g, ' ')

test('lista de compras: adicionar rápido, preço, total, comprado', async () => {
  const dir = makeTempDir('pth-shop-')
  let { app, page } = await launchApp(dir)
  await page.getByTestId('nav-shopping').click()
  await page.getByTestId('shopping-quick').fill('Café 2')
  await page.keyboard.press('Enter')
  const [item] = await invoke(page, 'shopping.list', {})
  expect(item).toMatchObject({ name: 'Café', quantity: 2 })
  await page.getByTestId(`shopping-edit-${item.id}`).click()
  await page.getByTestId('shopping-price').fill('12,50')
  await page.getByTestId('shopping-category').fill('Mercado')
  await page.getByTestId('shopping-save').click()
  await expect.poll(async () => norm(await page.getByTestId('shopping-total').textContent())).toBe('R$ 25,00')
  await page.getByTestId(`shopping-check-${item.id}`).check()
  await expect.poll(async () => norm(await page.getByTestId('shopping-total').textContent())).toBe('R$ 0,00')
  await expect(page.getByTestId(`shopping-item-${item.id}`)).toHaveCount(0)
  await page.getByTestId('shopping-filter-bought').click()
  await expect(page.getByTestId(`shopping-item-${item.id}`)).toBeVisible()
  await expect.poll(async () => norm(await page.getByTestId('shopping-month').textContent())).toBe('R$ 25,00')
  await app.close()
  ;({ app, page } = await launchApp(dir))
  expect((await invoke(page, 'shopping.list', { status: 'bought' }))[0]).toMatchObject({ name: 'Café', priceCents: 1250, category: 'Mercado' })
  await app.close()
})
