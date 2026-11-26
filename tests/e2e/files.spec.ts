import { test, expect } from '@playwright/test'
import { invoke, launchApp, upload } from '../helpers/app'

test('anexos aparecem em Arquivos e na aba do projeto; excluir remove', async () => {
  const { app, page } = await launchApp()
  const p = await invoke(page, 'projects.create', { companyId: 1, folderId: null, name: 'Docs', color: '#000' })
  const t = await invoke(page, 'tasks.quickCreate', { projectId: p.id, title: 'Com anexo' })
  const [a1] = await invoke(page, 'attachments.add', { taskId: t.id, uploads: [await upload(page, 'nota.txt', 'a', 'text/plain')] })
  await invoke(page, 'attachments.add', { projectId: p.id, uploads: [await upload(page, 'planta.pdf', 'b', 'application/pdf')] })
  await page.getByTestId('nav-files').click()
  await expect(page.getByTestId('files-table')).toContainText('nota.txt')
  await expect(page.getByTestId('files-table')).toContainText('planta.pdf')
  await page.getByTestId('files-search').fill('planta')
  await expect(page.getByTestId('files-table')).not.toContainText('nota.txt')
  await page.evaluate((id) => { location.hash = `#/projects/${id}` }, p.id)
  await page.getByTestId('tab-files').click()
  await expect(page.getByTestId(`project-files-${p.id}`)).toContainText('nota.txt')
  await page.getByTestId(`file-row-${a1.id}`).hover()
  await page.getByTestId(`file-row-${a1.id}`).getByTitle('Excluir').click()
  await page.getByTestId('confirm-ok').click()
  await expect(page.getByTestId(`project-files-${p.id}`)).not.toContainText('nota.txt')
  await app.close()
})

test('PDF de 20 MB com acento e espaço no nome sobe, aparece com o nome original e abre', async () => {
  const { app, page } = await launchApp()
  const p = await invoke(page, 'projects.create', { companyId: 1, folderId: null, name: 'Relatórios', color: '#000' })
  const name = 'Relatório final (v2).pdf'
  const size = 20 * 1024 * 1024
  const buffer = Buffer.alloc(size, 0x20)
  buffer.write('%PDF-1.4\n', 0)
  await page.evaluate((id) => { location.hash = `#/projects/${id}` }, p.id)
  await page.getByTestId('tab-files').click()
  await page.getByTestId('project-file-input').setInputFiles({ name, mimeType: 'application/pdf', buffer })
  const list = page.getByTestId(`project-files-${p.id}`)
  await expect(list).toContainText(name, { timeout: 60_000 })
  const [att] = await invoke(page, 'attachments.list', { projectId: p.id })
  expect(att.originalName).toBe(name)
  expect(att.sizeBytes).toBe(size)

  const popup = page.context().waitForEvent('page')
  await list.getByText(name).click()
  const tab = await popup
  await tab.waitForURL(/\/api\/dev-files\//)
  const res = await page.request.get(tab.url())
  expect(res.status()).toBe(200)
  expect(res.headers()['content-type']).toBe('application/pdf')
  expect((await res.body()).length).toBe(size)
  await tab.close()
  await app.close()
})
