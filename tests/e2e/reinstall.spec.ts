import { test, expect, _electron as electron } from '@playwright/test'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { invoke, makeTempDir } from '../helpers/app'

// Phase-driven by env: REINSTALL_PHASE=write|check, REINSTALL_DIR=<data dir>
const bin = join(homedir(), '.local/opt/personal-task-hub/personal-task-hub')
const phase = process.env.REINSTALL_PHASE
const stateFile = join(require('node:os').tmpdir(), 'pth-reinstall-dir.txt')

test('dados sobrevivem à reinstalação do app', async () => {
  test.skip(!phase || !existsSync(bin), 'executado apenas pelo procedimento de reinstalação')
  const dir = phase === 'write' ? makeTempDir('pth-reinstall-') : readFileSync(stateFile, 'utf8')
  const app = await electron.launch({ executablePath: bin, env: { ...process.env, PTH_DATA_DIR: dir, PTH_NO_RELAUNCH: '1' } })
  const page = await app.firstWindow()
  if (phase === 'write') {
    writeFileSync(stateFile, dir)
    const c = await invoke(page, 'companies.create', { name: 'Teste Reinstalação', color: '#000' })
    const p = await invoke(page, 'projects.create', { companyId: c.id, folderId: null, name: 'P', color: '#000' })
    await invoke(page, 'tasks.quickCreate', { projectId: p.id, title: 'Sobrevive?' })
  } else {
    const list = await invoke(page, 'companies.list', {})
    expect(list.some((x: { name: string }) => x.name === 'Teste Reinstalação')).toBe(true)
    const tasks = await invoke(page, 'tasks.query', { filter: {}, sort: 'due' })
    expect(tasks.map((t: { title: string }) => t.title)).toContain('Sobrevive?')
  }
  await app.close()
})
