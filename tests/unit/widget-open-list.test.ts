import { createProject } from '@main/services/projects'
import { quickCreateTask } from '@main/services/taskQuery'
import { setTaskStatus } from '@main/services/tasks'
import { getWidgetData } from '@main/services/widgetData'
import { createTestCtx } from '../helpers/ctx'

test('lista "Todas as abertas" não inclui concluídas mesmo sem filtro salvo', () => {
  const T = createTestCtx()
  const p = createProject(T.ctx, { companyId: 1, folderId: null, name: 'P', color: '#000' })
  quickCreateTask(T.ctx, { projectId: p.id, title: 'aberta' })
  const d = quickCreateTask(T.ctx, { projectId: p.id, title: 'feita' })
  setTaskStatus(T.ctx, d.id, 'done')
  const r = getWidgetData(T.ctx, { widget: { type: 'taskList', config: { source: { kind: 'inherit' }, list: 'filter' } }, dashboardScope: 'all' })
  expect(r).toMatchObject({ kind: 'taskList', items: [expect.objectContaining({ title: 'aberta' })] })
  expect((r as { items: unknown[] }).items).toHaveLength(1)
  T.cleanup()
})
