import { createProject } from '@server/services/projects'
import { quickCreateTask } from '@server/services/taskQuery'
import { setTaskStatus } from '@server/services/tasks'
import { getWidgetData } from '@server/services/widgetData'
import { createTestCtx } from '../helpers/ctx'

test('lista "Todas as abertas" não inclui concluídas mesmo sem filtro salvo', async () => {
  const T = await createTestCtx()
  const p = await createProject(T.ctx, { companyId: 1, folderId: null, name: 'P', color: '#000' })
  await quickCreateTask(T.ctx, { projectId: p.id, title: 'aberta' })
  const d = await quickCreateTask(T.ctx, { projectId: p.id, title: 'feita' })
  await setTaskStatus(T.ctx, d.id, 'done')
  const r = await getWidgetData(T.ctx, { widget: { type: 'taskList', config: { source: { kind: 'inherit' }, list: 'filter' } }, dashboardScope: 'all' })
  expect(r).toMatchObject({ kind: 'taskList', items: [expect.objectContaining({ title: 'aberta' })] })
  expect((r as { items: unknown[] }).items).toHaveLength(1)
  await T.cleanup()
})
