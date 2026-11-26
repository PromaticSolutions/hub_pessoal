import { createProject } from '@server/services/projects'
import { getBoard } from '@server/services/boards'
import { createTask, getTask, updateTask, duplicateTask, archiveTask, restoreTask, deleteTask, setTaskLabels, listActivity } from '@server/services/tasks'
import { createLabel, deleteLabel } from '@server/services/labels'
import { addComment, updateComment, deleteComment } from '@server/services/comments'
import { addChecklist, renameChecklist, deleteChecklist, addChecklistItem, updateChecklistItem, moveChecklistItem, deleteChecklistItem } from '@server/services/checklists'
import { createTestCtx } from '../helpers/ctx'

let T: Awaited<ReturnType<typeof createTestCtx>>
beforeEach(async () => { T = await createTestCtx() })
afterEach(() => T.cleanup())

async function setup() {
  const p = await createProject(T.ctx, { companyId: 1, folderId: null, name: 'P', color: '#000' })
  const boardId = ((await T.ctx.db.one('SELECT id FROM boards WHERE project_id = ?', [p.id])) as { id: number }).id
  const cols = (await getBoard(T.ctx, boardId, {})).columns
  const t = await createTask(T.ctx, { columnId: cols[0].id, title: 'Tarefa' })
  return { p, boardId, cols, t }
}

test('getTask retorna detalhe completo com contexto', async () => {
  const { t, p } = await setup()
  const d = await getTask(T.ctx, t.id)
  expect(d).toMatchObject({ title: 'Tarefa', status: 'todo', project: { id: p.id }, company: { isPersonal: true }, labels: [], checklists: [], comments: [], attachments: [], isOverdue: false })
  expect(d.column.name).toBe('Backlog')
})

test('update registra só campos alterados', async () => {
  const { t } = await setup()
  await updateTask(T.ctx, t.id, { title: 'Tarefa', priority: 'high', dueAt: '2026-12-01' })
  const updates = (await listActivity(T.ctx, t.id)).filter((a) => a.action === 'updated')
  expect(updates.map((a) => a.field).sort()).toEqual(['dueAt', 'priority'])
  expect(updates.find((a) => a.field === 'priority')).toMatchObject({ oldValue: 'medium', newValue: 'high' })
})

test('datas invertidas → VALIDATION; título vazio → VALIDATION', async () => {
  const { t } = await setup()
  await expect(updateTask(T.ctx, t.id, { startAt: '2026-12-10', dueAt: '2026-12-01' })).rejects.toMatchObject({ code: 'VALIDATION' })
  await expect(updateTask(T.ctx, t.id, { title: ' ' })).rejects.toMatchObject({ code: 'VALIDATION' })
})

test('duplicate copia etiquetas e checklists desmarcados, não copia comentários', async () => {
  const { t, boardId } = await setup()
  const l = await createLabel(T.ctx, { name: 'Cliente', color: '#f00' })
  await setTaskLabels(T.ctx, t.id, [l.id])
  const cl = await addChecklist(T.ctx, { taskId: t.id })
  const it = await addChecklistItem(T.ctx, { checklistId: cl.id, text: 'a' })
  await updateChecklistItem(T.ctx, it.id, { done: true })
  await addComment(T.ctx, { taskId: t.id, body: 'oi' })
  const copy = await duplicateTask(T.ctx, t.id)
  const d = await getTask(T.ctx, copy.id)
  expect(d.title).toBe('Tarefa (cópia)')
  expect(d.labels.map((x) => x.name)).toEqual(['Cliente'])
  expect(d.checklists[0].items).toMatchObject([{ text: 'a', done: false }])
  expect(d.comments).toEqual([])
  const order = (await getBoard(T.ctx, boardId, {})).cards.map((c) => c.id)
  expect(order.indexOf(copy.id)).toBe(order.indexOf(t.id) + 1)
})

test('excluir etiqueta remove das tarefas', async () => {
  const { t } = await setup()
  const l = await createLabel(T.ctx, { name: 'X', color: '#f00' })
  await setTaskLabels(T.ctx, t.id, [l.id])
  await deleteLabel(T.ctx, l.id)
  expect((await getTask(T.ctx, t.id)).labels).toEqual([])
})

test('comentários: adicionar, editar, excluir e histórico', async () => {
  const { t } = await setup()
  const c = await addComment(T.ctx, { taskId: t.id, body: 'primeiro' })
  expect((await updateComment(T.ctx, c.id, { body: 'editado' })).body).toBe('editado')
  await deleteComment(T.ctx, c.id)
  expect((await getTask(T.ctx, t.id)).comments).toEqual([])
  expect((await listActivity(T.ctx, t.id)).some((a) => a.action === 'commented')).toBe(true)
})

test('checklists: renomear, mover item, excluir', async () => {
  const { t } = await setup()
  const cl = await addChecklist(T.ctx, { taskId: t.id, title: 'Passos' })
  await renameChecklist(T.ctx, cl.id, 'Etapas')
  const a = await addChecklistItem(T.ctx, { checklistId: cl.id, text: 'a' })
  const b = await addChecklistItem(T.ctx, { checklistId: cl.id, text: 'b' })
  await moveChecklistItem(T.ctx, { id: b.id, checklistId: cl.id, beforeId: null, afterId: a.id })
  expect((await getTask(T.ctx, t.id)).checklists[0]).toMatchObject({ title: 'Etapas', items: [{ text: 'b' }, { text: 'a' }] })
  await deleteChecklistItem(T.ctx, a.id)
  expect((await getTask(T.ctx, t.id)).checklists[0].items).toHaveLength(1)
  await deleteChecklist(T.ctx, cl.id)
  expect((await getTask(T.ctx, t.id)).checklists).toEqual([])
})

test('arquivar, restaurar e excluir; exclusão remove do índice de busca', async () => {
  const { t } = await setup()
  expect((await archiveTask(T.ctx, t.id)).archivedAt).not.toBeNull()
  expect((await restoreTask(T.ctx, t.id)).archivedAt).toBeNull()
  await deleteTask(T.ctx, t.id)
  await expect(getTask(T.ctx, t.id)).rejects.toMatchObject({ code: 'NOT_FOUND' })
  expect((await T.ctx.db.one("SELECT count(*) n FROM search_index WHERE entity_type = 'task'", []))).toEqual({ n: 0 })
})

test('updateTask com patch parcial não toca outros campos', async () => {
  const { t } = await setup()
  await T.ctx.db.run("UPDATE tasks SET description = 'antiga' WHERE id = ?", [t.id])
  await updateTask(T.ctx, t.id, { title: 'B' })
  await T.ctx.db.run("UPDATE tasks SET title = 'mudou em outra aba' WHERE id = ?", [t.id])
  await updateTask(T.ctx, t.id, { description: 'D' })
  expect(await T.ctx.db.one('SELECT title, description FROM tasks WHERE id = ?', [t.id])).toEqual({ title: 'mudou em outra aba', description: 'D' })
  await updateTask(T.ctx, t.id, { title: 'B' })
  expect(await T.ctx.db.one('SELECT title, description FROM tasks WHERE id = ?', [t.id])).toEqual({ title: 'B', description: 'D' })
})
