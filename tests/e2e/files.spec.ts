import { test, expect } from '@playwright/test'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { invoke, launchApp, makeTempDir } from '../helpers/app'

test('anexos aparecem em Arquivos e na aba do projeto; excluir remove', async () => {
  const { app, page } = await launchApp(makeTempDir('pth-files-'))
  const p = await invoke(page, 'projects.create', { companyId: 1, folderId: null, name: 'Docs', color: '#000' })
  const t = await invoke(page, 'tasks.quickCreate', { projectId: p.id, title: 'Com anexo' })
  const dir = makeTempDir('pth-src-')
  writeFileSync(join(dir, 'nota.txt'), 'a')
  writeFileSync(join(dir, 'planta.pdf'), 'b')
  const [a1] = await invoke(page, 'attachments.add', { taskId: t.id, sourcePaths: [join(dir, 'nota.txt')] })
  await invoke(page, 'attachments.add', { projectId: p.id, sourcePaths: [join(dir, 'planta.pdf')] })
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
