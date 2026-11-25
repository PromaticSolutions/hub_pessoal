import { test, expect, _electron as electron } from '@playwright/test'
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { invoke, makeTempDir } from '../helpers/app'

const bin = resolve(__dirname, '../../dist/linux-unpacked/personal-task-hub')

test('app empacotado abre, grava e cria backup automático', async () => {
  test.skip(!existsSync(bin), 'rode npm run dist antes')
  const dir = makeTempDir('pth-pkg-')
  const app = await electron.launch({ executablePath: bin, env: { ...process.env, PTH_DATA_DIR: dir, PTH_NO_RELAUNCH: '1' } })
  const page = await app.firstWindow()
  await expect(page).toHaveTitle('Personal Task Hub')
  const c = await invoke(page, 'companies.create', { name: 'Pacote', color: '#000' })
  expect(c.name).toBe('Pacote')
  expect(existsSync(join(dir, 'hub.db'))).toBe(true)
  expect(existsSync(join(dir, 'backups', 'auto'))).toBe(true)
  await app.close()
})
