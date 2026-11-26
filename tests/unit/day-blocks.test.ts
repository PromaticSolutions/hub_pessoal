import { createProject } from '@server/services/projects'
import { getBoard } from '@server/services/boards'
import { createTask, deleteTask, getTask, setTaskStatus } from '@server/services/tasks'
import { listBlocks, createBlock, updateBlock, moveBlock, setBlockDone, deleteBlock, copyFromDay } from '@server/services/dayBlocks'
import { queryTasks } from '@server/services/taskQuery'
import { getDashboard } from '@server/services/dashboard'
import { daySummary, addMinutes, toMinutes, roundTo15 } from '@shared/day'
import { createTestCtx } from '../helpers/ctx'

let T: Awaited<ReturnType<typeof createTestCtx>>
beforeEach(async () => { T = await createTestCtx(new Date(2026, 10, 25, 9)) })
afterEach(() => T.cleanup())
const D = '2026-11-26'

async function task(title = 'Desenvolver integração CRM') {
  const p = await createProject(T.ctx, { companyId: 1, folderId: null, name: 'Projeto CRM', color: '#000' })
  const boardId = ((await T.ctx.db.one('SELECT id FROM boards WHERE project_id = ?', [p.id])) as { id: number }).id
  return await createTask(T.ctx, { columnId: (await getBoard(T.ctx, boardId, {})).columns[0].id, title, dueAt: '2026-11-28' })
}
const taskCount = async () => ((await T.ctx.db.one('SELECT count(*) n FROM tasks', [])) as { n: number }).n

test('alocar tarefa existente não cria cópia e traz projeto/empresa', async () => {
  const t = await task()
  const before = await taskCount()
  const b = await createBlock(T.ctx, { date: D, startTime: '09:00', endTime: '10:30', taskId: t.id })
  expect(await taskCount()).toBe(before)
  const [v] = await listBlocks(T.ctx, { date: D })
  expect(v).toMatchObject({ id: b.id, taskId: t.id, displayTitle: 'Desenvolver integração CRM', isDone: false })
  expect(v.task).toMatchObject({ projectName: 'Projeto CRM', companyName: 'Pessoal' })
})

test('atividade livre, validações e sobreposição permitida', async () => {
  await createBlock(T.ctx, { date: D, startTime: '12:00', endTime: '13:00', title: 'Almoço' })
  await createBlock(T.ctx, { date: D, startTime: '12:30', endTime: '13:30', title: 'Sobreposto' })
  expect((await listBlocks(T.ctx, { date: D })).map((b) => b.displayTitle)).toEqual(['Almoço', 'Sobreposto'])
  const bad = (x: object) => expect(createBlock(T.ctx, { date: D, startTime: '10:00', endTime: '11:00', title: 'x', ...x })).rejects.toMatchObject({ code: 'VALIDATION' })
  await bad({ endTime: '10:00' })
  await bad({ endTime: '09:00' })
  await bad({ startTime: '25:00' })
  await bad({ startTime: '10:03' })
  await bad({ title: '' })
  await bad({ date: '26/11/2026' })
})

test('mover mantém duração e encosta em 24:00', async () => {
  const b = await createBlock(T.ctx, { date: D, startTime: '09:00', endTime: '10:00', title: 'x' })
  expect(await moveBlock(T.ctx, { id: b.id, date: D, startTime: '23:30' })).toMatchObject({ startTime: '23:00', endTime: '24:00' })
  expect(await moveBlock(T.ctx, { id: b.id, date: '2026-11-27', startTime: '07:15' })).toMatchObject({ date: '2026-11-27', startTime: '07:15', endTime: '08:15' })
  expect(await updateBlock(T.ctx, b.id, { endTime: '09:00', startTime: '08:00', note: 'obs' })).toMatchObject({ startTime: '08:00', endTime: '09:00', note: 'obs' })
  await expect(updateBlock(T.ctx, b.id, { endTime: '07:00' })).rejects.toMatchObject({ code: 'VALIDATION' })
})

test('concluir bloco de tarefa muda o status da tarefa e o dashboard', async () => {
  const t = await task()
  const b = await createBlock(T.ctx, { date: D, startTime: '09:00', endTime: '10:00', taskId: t.id })
  await setBlockDone(T.ctx, b.id, true)
  expect((await getTask(T.ctx, t.id)).status).toBe('done')
  expect((await getDashboard(T.ctx, { scope: 'all' })).kpis.done).toBe(1)
  expect((await listBlocks(T.ctx, { date: D }))[0].isDone).toBe(true)
  await setBlockDone(T.ctx, b.id, false)
  expect((await getTask(T.ctx, t.id)).status).toBe('todo')
  const free = await createBlock(T.ctx, { date: D, startTime: '12:00', endTime: '13:00', title: 'Almoço' })
  await setBlockDone(T.ctx, free.id, true)
  expect((await listBlocks(T.ctx, { date: D })).find((x) => x.id === free.id)!.isDone).toBe(true)
})

test('excluir tarefa mantém o bloco como atividade com o título original', async () => {
  const t = await task('Revisar CRM')
  const b = await createBlock(T.ctx, { date: D, startTime: '09:00', endTime: '10:00', taskId: t.id })
  await deleteTask(T.ctx, t.id)
  expect((await listBlocks(T.ctx, { date: D }))[0]).toMatchObject({ id: b.id, taskId: null, displayTitle: 'Revisar CRM (tarefa excluída)' })
  await deleteBlock(T.ctx, b.id)
  expect(await listBlocks(T.ctx, { date: D })).toEqual([])
})

test('copiar do dia anterior: livres e tarefas abertas, sem duplicar', async () => {
  const open = await task('Aberta')
  const done = await task('Feita')
  await setTaskStatus(T.ctx, done.id, 'done')
  await createBlock(T.ctx, { date: '2026-11-25', startTime: '08:00', endTime: '09:00', title: 'Planejar' })
  await createBlock(T.ctx, { date: '2026-11-25', startTime: '09:00', endTime: '10:00', taskId: open.id })
  await createBlock(T.ctx, { date: '2026-11-25', startTime: '10:00', endTime: '11:00', taskId: done.id })
  expect(await copyFromDay(T.ctx, { from: '2026-11-25', to: D })).toBe(2)
  expect(await copyFromDay(T.ctx, { from: '2026-11-25', to: D })).toBe(0)
  expect((await listBlocks(T.ctx, { date: D })).map((b) => b.displayTitle)).toEqual(['Planejar', 'Aberta'])
})

test('tarefa programada aparece em getTask e na consulta global', async () => {
  const t = await task()
  expect((await queryTasks(T.ctx, { filter: {}, sort: 'due' }))[0].scheduled).toBe(false)
  await createBlock(T.ctx, { date: D, startTime: '09:00', endTime: '10:30', taskId: t.id })
  await createBlock(T.ctx, { date: '2026-11-20', startTime: '09:00', endTime: '10:00', taskId: t.id })
  expect((await getTask(T.ctx, t.id)).scheduled).toEqual([{ date: D, startTime: '09:00', endTime: '10:30' }])
  expect((await queryTasks(T.ctx, { filter: {}, sort: 'due' }))[0].scheduled).toBe(true)
})

test('resumo do dia: planejado, concluído, horas e intervalos livres', async () => {
  const mk = (s: string, e: string, done = false) => ({ startTime: s, endTime: e, isDone: done }) as never
  const r = daySummary([mk('08:00', '09:00', true), mk('08:30', '10:00'), mk('12:00', '13:00', true), mk('19:00', '20:00')], { start: '08:00', end: '18:00' })
  expect(r).toEqual({
    planned: 4,
    done: 2,
    plannedMinutes: 120 + 60 + 60,
    freeMinutes: 600 - 180,
    freeIntervals: [{ start: '10:00', end: '12:00' }, { start: '13:00', end: '18:00' }]
  })
  expect(toMinutes('24:00')).toBe(1440)
  expect(addMinutes('23:30', 30)).toBe('24:00')
  expect(roundTo15(68)).toBe(75)
  expect(roundTo15(67)).toBe(60)
})
