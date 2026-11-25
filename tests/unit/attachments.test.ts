import { existsSync, readFileSync, statSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { createProject } from '@main/services/projects'
import { getBoard } from '@main/services/boards'
import { createTask } from '@main/services/tasks'
import { addAttachments, listAttachments, deleteAttachment, getAttachmentAbsPath, restoreMissingAttachments, getAttachmentDataUrl } from '@main/services/attachments'
import { createTestCtx, tempFile } from '../helpers/ctx'

let T: ReturnType<typeof createTestCtx>
beforeEach(() => { T = createTestCtx() })
afterEach(() => T.cleanup())

function setup() {
  const p = createProject(T.ctx, { companyId: 1, folderId: null, name: 'Proj', color: '#000' })
  const boardId = (T.ctx.db.prepare('SELECT id FROM boards WHERE project_id = ?').get(p.id) as { id: number }).id
  const t = createTask(T.ctx, { columnId: getBoard(T.ctx, boardId, {}).columns[0].id, title: 'Tarefa' })
  return { p, t }
}

test('mesmo nome com conteúdos diferentes → caminhos distintos e conteúdos preservados', () => {
  const { t } = setup()
  const a = tempFile('relatório final.pdf', 'AAA')
  const b = tempFile('relatório final.pdf', 'BBB')
  const [x, y] = addAttachments(T.ctx, { taskId: t.id, sourcePaths: [a, b] })
  expect(x.storedPath).not.toBe(y.storedPath)
  expect(x.originalName).toBe('relatório final.pdf')
  expect(x.mimeType).toBe('application/pdf')
  expect(readFileSync(getAttachmentAbsPath(T.ctx, x.id), 'utf8')).toBe('AAA')
  expect(readFileSync(getAttachmentAbsPath(T.ctx, y.id), 'utf8')).toBe('BBB')
  expect(existsSync(a)).toBe(true)
})

test('arquivo grande (50 MB) copiado com tamanho igual', () => {
  const { t } = setup()
  const big = tempFile('big.bin', Buffer.alloc(50 * 1024 * 1024, 7))
  const [att] = addAttachments(T.ctx, { taskId: t.id, sourcePaths: [big] })
  expect(att.sizeBytes).toBe(50 * 1024 * 1024)
  expect(statSync(getAttachmentAbsPath(T.ctx, att.id)).size).toBe(50 * 1024 * 1024)
})

test('list traz origem; delete move para attachments-deleted; restoreMissing traz de volta', () => {
  const { t, p } = setup()
  const [att] = addAttachments(T.ctx, { taskId: t.id, sourcePaths: [tempFile('foto.png', 'img')] })
  const [patt] = addAttachments(T.ctx, { projectId: p.id, sourcePaths: [tempFile('contrato.docx', 'doc')] })
  const list = listAttachments(T.ctx, {})
  expect(list.find((a) => a.id === att.id)).toMatchObject({ taskTitle: 'Tarefa', projectName: 'Proj', companyName: 'Pessoal', kind: 'image' })
  expect(listAttachments(T.ctx, { projectId: p.id }).map((a) => a.id).sort()).toEqual([att.id, patt.id].sort())
  expect(listAttachments(T.ctx, { kind: 'document' }).map((a) => a.id)).toEqual([patt.id])
  expect(listAttachments(T.ctx, { text: 'contr' }).map((a) => a.id)).toEqual([patt.id])
  const abs = getAttachmentAbsPath(T.ctx, att.id)
  const rel = att.storedPath
  deleteAttachment(T.ctx, att.id)
  expect(existsSync(abs)).toBe(false)
  expect(existsSync(join(T.ctx.paths.attachmentsDeleted, rel))).toBe(true)
  // simulate DB restore: row comes back, file is in attachments-deleted
  T.ctx.db.prepare('INSERT INTO attachments(id, task_id, original_name, stored_path) VALUES (?, ?, ?, ?)').run(att.id, t.id, 'foto.png', rel)
  expect(restoreMissingAttachments(T.ctx.paths, T.ctx.db)).toEqual({ restored: 1, missing: 0 })
  expect(existsSync(abs)).toBe(true)
})

test('arquivo ausente → NOT_FOUND "Arquivo indisponível"', () => {
  const { t } = setup()
  const [att] = addAttachments(T.ctx, { taskId: t.id, sourcePaths: [tempFile('x.txt', 'x')] })
  rmSync(join(T.ctx.paths.attachments, att.storedPath))
  expect(() => getAttachmentAbsPath(T.ctx, att.id)).toThrow(expect.objectContaining({ code: 'NOT_FOUND' }))
  expect(restoreMissingAttachments(T.ctx.paths, T.ctx.db)).toEqual({ restored: 0, missing: 1 })
})

test('anexo aparece no índice de busca e miniatura de imagem', () => {
  const { t } = setup()
  const [att] = addAttachments(T.ctx, { taskId: t.id, sourcePaths: [tempFile('orçamento.png', 'png')] })
  expect(T.ctx.db.prepare("SELECT count(*) n FROM search_index WHERE search_index MATCH 'orcamento'").get()).toEqual({ n: 1 })
  expect(getAttachmentDataUrl(T.ctx, att.id)).toBe(`data:image/png;base64,${Buffer.from('png').toString('base64')}`)
})
