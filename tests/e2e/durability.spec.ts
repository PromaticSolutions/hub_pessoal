import { test, expect } from '@playwright/test'
import { _electron as electron } from '@playwright/test'
import { resolve } from 'node:path'
import { invoke, launchApp, makeTempDir } from '../helpers/app'

test('dados confirmados sobrevivem a kill -9', async () => {
  const dir = makeTempDir('pth-kill-')
  let { app, page } = await launchApp(dir)
  await invoke(page, 'settings.set', { key: 'probe', value: 42 })
  process.kill(app.process().pid!, 'SIGKILL')
  await new Promise((r) => setTimeout(r, 500))
  ;({ app, page } = await launchApp(dir))
  expect(await invoke(page, 'settings.get', { key: 'probe' })).toBe(42)
  await app.close()
})

test('segunda instância encerra e mantém a primeira', async () => {
  const dir = makeTempDir('pth-single-')
  const { app } = await launchApp(dir)
  const { spawn } = await import('node:child_process')
  const bin = require('electron') as unknown as string
  const code = await new Promise<number | null>((res) => {
    const p = spawn(bin, [resolve(__dirname, '../../out/main/index.js')], { env: { ...process.env, PTH_DATA_DIR: dir } })
    const timer = setTimeout(() => { p.kill('SIGKILL'); res(-1) }, 8000)
    p.on('exit', (c) => { clearTimeout(timer); res(c) })
  })
  expect(code).toBe(0)
  expect(app.windows().length).toBe(1)
  await app.close()
  void electron
})
