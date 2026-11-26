import { createProject } from '@main/services/projects'
import { getBoard } from '@main/services/boards'
import { createTask, deleteTask, getTask, setTaskStatus } from '@main/services/tasks'
import { listBlocks, createBlock, updateBlock, moveBlock, setBlockDone, deleteBlock, copyFromDay } from '@main/services/dayBlocks'
import { queryTasks } from '@main/services/taskQuery'
import { getDashboard } from '@main/services/dashboard'
import { daySummary, addMinutes, toMinutes, roundTo15 } from '@shared/day'
import { createTestCtx } from '../helpers/ctx'

let T: ReturnType<typeof createTestCtx>
beforeEach(() => { T = createTestCtx(new Date(2026, 10, 25, 9)) })
afterEach(() => T.cleanup())
const D = '2026-11-26'

function task(title = 'Desenvolver integração CRM') {
  const p = createProject(T.ctx, { companyId: 1, folderId: null, name: 'Projeto CRM', color: '#000' })
  const boardId = (T.ctx.db.prepare('SELECT id FROM boards WHERE project_id = ?').get(p.id) as { id: number }).id
  return createTask(T.ctx, { columnId: getBoard(T.ctx, boardId, {}).columns[0].id, title, dueAt: '2026-11-28' })
}
const taskCount = () => (T.ctx.db.prepare('SELECT count(*) n FROM tasks').get() as { n: number }).n

test('alocar tarefa existente não cria cópia e traz projeto/empresa', () => {
  const t = task()
  const before = taskCount()
  const b = createBlock(T.ctx, { date: D, startTime: '09:00', endTime: '10:30', taskId: t.id })
  expect(taskCount()).toBe(before)
  const [v] = listBlocks(T.ctx, { date: D })
  expect(v).toMatchObject({ id: b.id, taskId: t.id, displayTitle: 'Desenvolver integração CRM', isDone: false })
  expect(v.task).toMatchObject({ projectName: 'Projeto CRM', companyName: 'Pessoal' })
})

test('atividade livre, validações e sobreposição permitida', () => {
  createBlock(T.ctx, { date: D, startTime: '12:00', endTime: '13:00', title: 'Almoço' })
  createBlock(T.ctx, { date: D, startTime: '12:30', endTime: '13:30', title: 'Sobreposto' })
  expect(listBlocks(T.ctx, { date: D }).map((b) => b.displayTitle)).toEqual(['Almoço', 'Sobreposto'])
  const bad = (x: object) => expect(() => createBlock(T.ctx, { date: D, startTime: '10:00', endTime: '11:00', title: 'x', ...x })).toThrow(expect.objectContaining({ code: 'VALIDATION' }))
  bad({ endTime: '10:00' })
  bad({ endTime: '09:00' })
  bad({ startTime: '25:00' })
  bad({ startTime: '10:03' })
  bad({ title: '' })
  bad({ date: '26/11/2026' })
})

test('mover mantém duração e encosta em 24:00', () => {
  const b = createBlock(T.ctx, { date: D, startTime: '09:00', endTime: '10:00', title: 'x' })
  expect(moveBlock(T.ctx, { id: b.id, date: D, startTime: '23:30' })).toMatchObject({ startTime: '23:00', endTime: '24:00' })
  expect(moveBlock(T.ctx, { id: b.id, date: '2026-11-27', startTime: '07:15' })).toMatchObject({ date: '2026-11-27', startTime: '07:15', endTime: '08:15' })
  expect(updateBlock(T.ctx, b.id, { endTime: '09:00', startTime: '08:00', note: 'obs' })).toMatchObject({ startTime: '08:00', endTime: '09:00', note: 'obs' })
  expect(() => updateBlock(T.ctx, b.id, { endTime: '07:00' })).toThrow(expect.objectContaining({ code: 'VALIDATION' }))
})

test('concluir bloco de tarefa muda o status da tarefa e o dashboard', () => {
  const t = task()
  const b = createBlock(T.ctx, { date: D, startTime: '09:00', endTime: '10:00', taskId: t.id })
  setBlockDone(T.ctx, b.id, true)
  expect(getTask(T.ctx, t.id).status).toBe('done')
  expect(getDashboard(T.ctx, { scope: 'all' }).kpis.done).toBe(1)
  expect(listBlocks(T.ctx, { date: D })[0].isDone).toBe(true)
  setBlockDone(T.ctx, b.id, false)
  expect(getTask(T.ctx, t.id).status).toBe('todo')
  const free = createBlock(T.ctx, { date: D, startTime: '12:00', endTime: '13:00', title: 'Almoço' })
  setBlockDone(T.ctx, free.id, true)
  expect(listBlocks(T.ctx, { date: D }).find((x) => x.id === free.id)!.isDone).toBe(true)
})

test('excluir tarefa mantém o bloco como atividade com o título original', () => {
  const t = task('Revisar CRM')
  const b = createBlock(T.ctx, { date: D, startTime: '09:00', endTime: '10:00', taskId: t.id })
  deleteTask(T.ctx, t.id)
  expect(listBlocks(T.ctx, { date: D })[0]).toMatchObject({ id: b.id, taskId: null, displayTitle: 'Revisar CRM (tarefa excluída)' })
  deleteBlock(T.ctx, b.id)
  expect(listBlocks(T.ctx, { date: D })).toEqual([])
})

test('copiar do dia anterior: livres e tarefas abertas, sem duplicar', () => {
  const open = task('Aberta')
  const done = task('Feita')
  setTaskStatus(T.ctx, done.id, 'done')
  createBlock(T.ctx, { date: '2026-11-25', startTime: '08:00', endTime: '09:00', title: 'Planejar' })
  createBlock(T.ctx, { date: '2026-11-25', startTime: '09:00', endTime: '10:00', taskId: open.id })
  createBlock(T.ctx, { date: '2026-11-25', startTime: '10:00', endTime: '11:00', taskId: done.id })
  expect(copyFromDay(T.ctx, { from: '2026-11-25', to: D })).toBe(2)
  expect(copyFromDay(T.ctx, { from: '2026-11-25', to: D })).toBe(0)
  expect(listBlocks(T.ctx, { date: D }).map((b) => b.displayTitle)).toEqual(['Planejar', 'Aberta'])
})

test('tarefa programada aparece em getTask e na consulta global', () => {
  const t = task()
  expect(queryTasks(T.ctx, { filter: {}, sort: 'due' })[0].scheduled).toBe(false)
  createBlock(T.ctx, { date: D, startTime: '09:00', endTime: '10:30', taskId: t.id })
  createBlock(T.ctx, { date: '2026-11-20', startTime: '09:00', endTime: '10:00', taskId: t.id })
  expect(getTask(T.ctx, t.id).scheduled).toEqual([{ date: D, startTime: '09:00', endTime: '10:30' }])
  expect(queryTasks(T.ctx, { filter: {}, sort: 'due' })[0].scheduled).toBe(true)
})

test('resumo do dia: planejado, concluído, horas e intervalos livres', () => {
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
