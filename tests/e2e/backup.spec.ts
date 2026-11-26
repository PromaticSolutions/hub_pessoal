import { test, expect } from '@playwright/test'
import { gunzipSync } from 'node:zlib'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { invoke, launchApp, makeTempDir, upload } from '../helpers/app'

test('baixar backup → apagar empresa → restaurar do arquivo traz tudo de volta (inclusive anexo)', async () => {
  const { app, page } = await launchApp()
  const c = await invoke(page, 'companies.create', { name: 'Cliente X', color: '#f00' })
  const p = await invoke(page, 'projects.create', { companyId: c.id, folderId: null, name: 'Site', color: '#000' })
  const t = await invoke(page, 'tasks.quickCreate', { projectId: p.id, title: 'Publicar' })
  await invoke(page, 'attachments.add', { taskId: t.id, uploads: [await upload(page, 'briefing.txt', 'briefing do cliente', 'text/plain')] })

  // "Baixar backup" abre uma aba com a URL assinada (download .json.gz)
  await page.getByTestId('nav-settings').click()
  const popup = page.context().waitForEvent('page')
  await page.getByTestId('backup-full').click()
  const download = await (await popup).waitForEvent('download')
  expect(download.suggestedFilename()).toMatch(/^personal-task-hub-.*\.json\.gz$/)
  const file = join(makeTempDir('pth-out-'), download.suggestedFilename())
  await download.saveAs(file)
  const data = JSON.parse(gunzipSync(readFileSync(file)).toString('utf8'))
  expect(data.manifest.counts.attachments).toBe(1)
  await expect(page.getByTestId('toast-success')).toContainText('Backup gerado')

  await invoke(page, 'companies.delete', { id: c.id })
  expect((await invoke(page, 'companies.list', {})).some((x: { name: string }) => x.name === 'Cliente X')).toBe(false)

  // "Restaurar de arquivo…" → resumo → Restaurar → a página recarrega
  await page.getByTestId('backup-restore-input').setInputFiles(file)
  await expect(page.getByTestId('restore-dialog')).toBeVisible()
  const reloaded = page.waitForEvent('load')
  await page.getByTestId('restore-ok').click()
  await reloaded
  await page.getByTestId('nav-settings').waitFor()

  expect((await invoke(page, 'companies.list', {})).some((x: { name: string }) => x.name === 'Cliente X')).toBe(true)
  const task = await invoke(page, 'tasks.get', { id: t.id })
  expect(task.attachments[0].originalName).toBe('briefing.txt')
  const url = await invoke(page, 'attachments.url', { id: task.attachments[0].id })
  expect(await (await page.request.get(url)).text()).toBe('briefing do cliente')
  await app.close()
})
