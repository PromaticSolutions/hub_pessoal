import { test, expect } from '@playwright/test'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { invoke, launchApp, makeTempDir } from '../helpers/app'

test('backup completo → apagar empresa → restaurar traz tudo de volta (inclusive anexo)', async () => {
  const dir = makeTempDir('pth-bk-e2e-')
  let { app, page } = await launchApp(dir)
  const c = await invoke(page, 'companies.create', { name: 'Cliente X', color: '#f00' })
  const p = await invoke(page, 'projects.create', { companyId: c.id, folderId: null, name: 'Site', color: '#000' })
  const t = await invoke(page, 'tasks.quickCreate', { projectId: p.id, title: 'Publicar' })
  const src = join(makeTempDir('pth-src-'), 'briefing.txt')
  writeFileSync(src, 'briefing do cliente')
  const [att] = await invoke(page, 'attachments.add', { taskId: t.id, sourcePaths: [src] })
  const zip = join(makeTempDir('pth-out-'), "meu backup's.zip")
  const manifest = await invoke(page, 'backup.createFull', { destPath: zip })
  expect(manifest.counts.attachments).toBe(1)
  expect(existsSync(zip)).toBe(true)

  await invoke(page, 'companies.delete', { id: c.id })
  expect((await invoke(page, 'companies.list', {})).some((x: { name: string }) => x.name === 'Cliente X')).toBe(false)

  const { token, manifest: m2 } = await invoke(page, 'backup.inspect', { path: zip })
  expect(m2.counts.tasks).toBe(1)
  const exited = new Promise((r) => app.process().on('exit', r))
  await invoke(page, 'backup.restore', { token })
  await exited

  ;({ app, page } = await launchApp(dir))
  expect((await invoke(page, 'companies.list', {})).some((x: { name: string }) => x.name === 'Cliente X')).toBe(true)
  const task = await invoke(page, 'tasks.get', { id: t.id })
  expect(task.attachments[0].originalName).toBe('briefing.txt')
  expect(readFileSync(join(dir, 'attachments', att.storedPath), 'utf8')).toBe('briefing do cliente')
  await app.close()
})
