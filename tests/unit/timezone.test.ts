import { createProject } from '@server/services/projects'
import { getBoard } from '@server/services/boards'
import { createTask } from '@server/services/tasks'
import { queryTasks } from '@server/services/taskQuery'
import { createBlock, listBlocks } from '@server/services/dayBlocks'
import { toLocalDate } from '@shared/dates'
import { createTestCtx } from '../helpers/ctx'

test('fuso: 01:30Z ainda é o dia anterior em São Paulo', async () => {
  const T = await createTestCtx(new Date('2026-11-25T01:30:00Z'))
  try {
    const p = await createProject(T.ctx, { companyId: 1, folderId: null, name: 'P', color: '#000' })
    const boardId = (await T.ctx.db.one<{ id: number }>('SELECT id FROM boards WHERE project_id = ?', [p.id]))!.id
    const col = (await getBoard(T.ctx, boardId, {})).columns[0]
    await createTask(T.ctx, { columnId: col.id, title: 'x', dueAt: '2026-11-24' })
    const [t] = await queryTasks(T.ctx, { filter: {}, sort: 'due' })
    expect(t.isOverdue).toBe(false)
    expect(await queryTasks(T.ctx, { filter: { overdueOnly: true }, sort: 'due' })).toHaveLength(0)
    const today = toLocalDate(T.ctx.now())
    const b = await createBlock(T.ctx, { date: today, startTime: '22:00', endTime: '23:00', title: 'noite' })
    expect(b.date).toBe('2026-11-24')
    expect((await listBlocks(T.ctx, { date: '2026-11-24' })).map((x) => x.id)).toEqual([b.id])
  } finally {
    await T.cleanup()
  }
})
