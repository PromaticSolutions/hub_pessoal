import { createProject } from '@main/services/projects'
import { getBoard } from '@main/services/boards'
import { createTask, getTask, updateTask, duplicateTask, archiveTask, restoreTask, deleteTask, setTaskLabels, listActivity } from '@main/services/tasks'
import { createLabel, deleteLabel } from '@main/services/labels'
import { addComment, updateComment, deleteComment } from '@main/services/comments'
import { addChecklist, renameChecklist, deleteChecklist, addChecklistItem, updateChecklistItem, moveChecklistItem, deleteChecklistItem } from '@main/services/checklists'
import { createTestCtx } from '../helpers/ctx'

let T: ReturnType<typeof createTestCtx>
beforeEach(() => { T = createTestCtx() })
afterEach(() => T.cleanup())

function setup() {
  const p = createProject(T.ctx, { companyId: 1, folderId: null, name: 'P', color: '#000' })
  const boardId = (T.ctx.db.prepare('SELECT id FROM boards WHERE project_id = ?').get(p.id) as { id: number }).id
  const cols = getBoard(T.ctx, boardId, {}).columns
  const t = createTask(T.ctx, { columnId: cols[0].id, title: 'Tarefa' })
  return { p, boardId, cols, t }
}

test('getTask retorna detalhe completo com contexto', () => {
  const { t, p } = setup()
  const d = getTask(T.ctx, t.id)
  expect(d).toMatchObject({ title: 'Tarefa', status: 'todo', project: { id: p.id }, company: { isPersonal: true }, labels: [], checklists: [], comments: [], attachments: [], isOverdue: false })
  expect(d.column.name).toBe('Backlog')
})

test('update registra só campos alterados', () => {
  const { t } = setup()
  updateTask(T.ctx, t.id, { title: 'Tarefa', priority: 'high', dueAt: '2026-12-01' })
  const updates = listActivity(T.ctx, t.id).filter((a) => a.action === 'updated')
  expect(updates.map((a) => a.field).sort()).toEqual(['dueAt', 'priority'])
  expect(updates.find((a) => a.field === 'priority')).toMatchObject({ oldValue: 'medium', newValue: 'high' })
})

test('datas invertidas → VALIDATION; título vazio → VALIDATION', () => {
  const { t } = setup()
  expect(() => updateTask(T.ctx, t.id, { startAt: '2026-12-10', dueAt: '2026-12-01' })).toThrow(expect.objectContaining({ code: 'VALIDATION' }))
  expect(() => updateTask(T.ctx, t.id, { title: ' ' })).toThrow(expect.objectContaining({ code: 'VALIDATION' }))
})

test('duplicate copia etiquetas e checklists desmarcados, não copia comentários', () => {
  const { t, boardId } = setup()
  const l = createLabel(T.ctx, { name: 'Cliente', color: '#f00' })
  setTaskLabels(T.ctx, t.id, [l.id])
  const cl = addChecklist(T.ctx, { taskId: t.id })
  const it = addChecklistItem(T.ctx, { checklistId: cl.id, text: 'a' })
  updateChecklistItem(T.ctx, it.id, { done: true })
  addComment(T.ctx, { taskId: t.id, body: 'oi' })
  const copy = duplicateTask(T.ctx, t.id)
  const d = getTask(T.ctx, copy.id)
  expect(d.title).toBe('Tarefa (cópia)')
  expect(d.labels.map((x) => x.name)).toEqual(['Cliente'])
  expect(d.checklists[0].items).toMatchObject([{ text: 'a', done: false }])
  expect(d.comments).toEqual([])
  const order = getBoard(T.ctx, boardId, {}).cards.map((c) => c.id)
  expect(order.indexOf(copy.id)).toBe(order.indexOf(t.id) + 1)
})

test('excluir etiqueta remove das tarefas', () => {
  const { t } = setup()
  const l = createLabel(T.ctx, { name: 'X', color: '#f00' })
  setTaskLabels(T.ctx, t.id, [l.id])
  deleteLabel(T.ctx, l.id)
  expect(getTask(T.ctx, t.id).labels).toEqual([])
})

test('comentários: adicionar, editar, excluir e histórico', () => {
  const { t } = setup()
  const c = addComment(T.ctx, { taskId: t.id, body: 'primeiro' })
  expect(updateComment(T.ctx, c.id, { body: 'editado' }).body).toBe('editado')
  deleteComment(T.ctx, c.id)
  expect(getTask(T.ctx, t.id).comments).toEqual([])
  expect(listActivity(T.ctx, t.id).some((a) => a.action === 'commented')).toBe(true)
})

test('checklists: renomear, mover item, excluir', () => {
  const { t } = setup()
  const cl = addChecklist(T.ctx, { taskId: t.id, title: 'Passos' })
  renameChecklist(T.ctx, cl.id, 'Etapas')
  const a = addChecklistItem(T.ctx, { checklistId: cl.id, text: 'a' })
  const b = addChecklistItem(T.ctx, { checklistId: cl.id, text: 'b' })
  moveChecklistItem(T.ctx, { id: b.id, checklistId: cl.id, beforeId: null, afterId: a.id })
  expect(getTask(T.ctx, t.id).checklists[0]).toMatchObject({ title: 'Etapas', items: [{ text: 'b' }, { text: 'a' }] })
  deleteChecklistItem(T.ctx, a.id)
  expect(getTask(T.ctx, t.id).checklists[0].items).toHaveLength(1)
  deleteChecklist(T.ctx, cl.id)
  expect(getTask(T.ctx, t.id).checklists).toEqual([])
})

test('arquivar, restaurar e excluir; exclusão remove do índice de busca', () => {
  const { t } = setup()
  expect(archiveTask(T.ctx, t.id).archivedAt).not.toBeNull()
  expect(restoreTask(T.ctx, t.id).archivedAt).toBeNull()
  deleteTask(T.ctx, t.id)
  expect(() => getTask(T.ctx, t.id)).toThrow(expect.objectContaining({ code: 'NOT_FOUND' }))
  expect(T.ctx.db.prepare("SELECT count(*) n FROM search_index WHERE entity_type = 'task'").get()).toEqual({ n: 0 })
})
