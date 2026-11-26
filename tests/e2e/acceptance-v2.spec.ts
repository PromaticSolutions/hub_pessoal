import { test, expect, type Page } from '@playwright/test'
import { invoke, launchApp, makeTempDir, pick } from '../helpers/app'

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const tabByPath = (page: Page, path: string) => page.locator(`[role=tab][data-tab-path="${path}"]`)

test('v2 integrado: tarefa aparece em todas as áreas, Meu Dia conclui, ideia vira tarefa, abas persistem', async () => {
  const dir = makeTempDir('pth-acc2-')
  let { app, page } = await launchApp(dir)
  const emp = await invoke(page, 'companies.create', { name: 'Empresa A', color: '#0E9384' })
  const p = await invoke(page, 'projects.create', { companyId: emp.id, folderId: null, name: 'Projeto CRM', color: '#0E9384' })
  const today = iso(new Date())
  const t = await invoke(page, 'tasks.quickCreate', { projectId: p.id, title: 'Desenvolver integração CRM', dueAt: today, priority: 'high' })

  // Todas as Tarefas
  await page.getByTestId('nav-all').click()
  await expect(page.getByTestId(`all-row-${t.id}`)).toBeVisible()
  // Minha semana
  await page.getByTestId('nav-week').click()
  await expect(page.getByTestId(`week-col-${today}`).getByTestId(`week-item-${t.id}`)).toBeVisible()
  // Meu Dia: aloca e conclui
  await page.getByTestId('nav-day').click()
  await page.getByTestId(`allocate-btn-${t.id}`).click()
  await pick(page, 'block-start', '09:00')
  await page.getByTestId('block-save').click()
  const [block] = await invoke(page, 'dayBlocks.list', { date: today })
  await page.getByTestId(`day-block-${block.id}`).locator('input[type=checkbox]').check()
  await expect(page.getByTestId('day-progress')).toContainText('1/1')
  // Dashboard reflete
  await page.getByTestId('nav-dashboard').click()
  await expect(page.getByTestId('kpi-done')).toHaveText('1')
  // Ideia → tarefa aparece em Todas as Tarefas
  const idea = await invoke(page, 'ideas.create', { title: 'Relatório automático' })
  await invoke(page, 'ideas.toTask', { id: idea.id, projectId: p.id })
  await page.getByTestId('nav-all').click()
  await expect(page.getByTestId('all-count')).toHaveText('2 tarefa(s)')
  // tarefa continua vinculada ao projeto/empresa original e não foi duplicada
  const all = await invoke(page, 'tasks.query', { filter: { includeArchived: true }, sort: 'due' })
  expect(all.filter((x: { title: string }) => x.title === 'Desenvolver integração CRM')).toHaveLength(1)
  expect(all.find((x: { id: number }) => x.id === t.id)).toMatchObject({ projectName: 'Projeto CRM', companyName: 'Empresa A', status: 'done' })
  // Abas: projeto em nova aba + persistência
  await page.getByTestId(`tree-company-${emp.id}`).locator('button').first().click()
  await page.getByTestId(`tree-project-${p.id}`).getByText('Projeto CRM').click({ modifiers: ['Control'] })
  await expect(tabByPath(page, `/projects/${p.id}`)).toBeVisible()
  await page.waitForTimeout(400)
  await app.close()
  ;({ app, page } = await launchApp(dir))
  await expect(tabByPath(page, `/projects/${p.id}`)).toBeVisible()
  await expect(tabByPath(page, '/all')).toBeVisible()
  await app.close()
})
