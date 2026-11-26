import { createProject } from '@server/services/projects'
import { getBoard } from '@server/services/boards'
import { createTask } from '@server/services/tasks'
import { addAttachments, listAttachments, deleteAttachment, getAttachmentUrl, restoreMissingAttachments } from '@server/services/attachments'
import { verifyLocalUrl } from '@server/storage/local'
import { createTestCtx, tempUpload } from '../helpers/ctx'

let T: Awaited<ReturnType<typeof createTestCtx>>
beforeEach(async () => { T = await createTestCtx() })
afterEach(() => T.cleanup())

const text = async (key: string) => new TextDecoder().decode(await T.ctx.storage.get(key))

async function setup() {
  const p = await createProject(T.ctx, { companyId: 1, folderId: null, name: 'Proj', color: '#000' })
  const boardId = (await T.ctx.db.one<{ id: number }>('SELECT id FROM boards WHERE project_id = ?', [p.id]))!.id
  const t = await createTask(T.ctx, { columnId: (await getBoard(T.ctx, boardId, {})).columns[0].id, title: 'Tarefa' })
  return { p, t }
}

/** Signed local URL → its key and query, as the dev file middleware sees them. */
function parseLocalUrl(url: string): { key: string; query: URLSearchParams } {
  const u = new URL(url, 'http://localhost')
  return { key: u.pathname.slice('/api/dev-files/'.length).split('/').map(decodeURIComponent).join('/'), query: u.searchParams }
}

test('mesmo nome com conteúdos diferentes → caminhos distintos e conteúdos preservados', async () => {
  const { t } = await setup()
  const a = await tempUpload(T.ctx.storage, 'relatório final.pdf', 'AAA')
  const b = await tempUpload(T.ctx.storage, 'relatório final.pdf', 'BBB')
  const [x, y] = await addAttachments(T.ctx, { taskId: t.id, uploads: [a, b] })
  expect(x.storedPath).not.toBe(y.storedPath)
  expect(x.originalName).toBe('relatório final.pdf')
  expect(x.mimeType).toBe('application/pdf')
  expect(await text(`attachments/${x.storedPath}`)).toBe('AAA')
  expect(await text(`attachments/${y.storedPath}`)).toBe('BBB')
  expect(await T.ctx.storage.exists(a.key)).toBe(false) // moved out of uploads/tmp/
  await T.ctx.storage.put('attachments/x.txt', new Uint8Array([1]))
  await expect(addAttachments(T.ctx, { taskId: t.id, uploads: [{ key: 'attachments/x.txt', name: 'x.txt', size: 1, mime: '' }] })).rejects.toMatchObject({ code: 'VALIDATION' })
})

test('arquivo grande (50 MB) copiado com tamanho igual', async () => {
  const { t } = await setup()
  const big = await tempUpload(T.ctx.storage, 'big.bin', new Uint8Array(50 * 1024 * 1024).fill(7))
  const [att] = await addAttachments(T.ctx, { taskId: t.id, uploads: [big] })
  expect(att.sizeBytes).toBe(50 * 1024 * 1024)
  expect((await T.ctx.storage.list(`attachments/${att.storedPath}`))[0].size).toBe(50 * 1024 * 1024)
})

test('arquivo grande e nome com acento', async () => {
  const { t } = await setup()
  const up = await tempUpload(T.ctx.storage, 'Relatório final (v2).pdf', new Uint8Array(20 * 1024 * 1024).fill(3), 'application/pdf')
  const [att] = await addAttachments(T.ctx, { taskId: t.id, uploads: [up] })
  expect(att.originalName).toBe('Relatório final (v2).pdf')
  expect(att.sizeBytes).toBe(20_971_520)
  const url = await getAttachmentUrl(T.ctx, att.id, { download: true })
  const { key, query } = parseLocalUrl(url)
  expect(key).toBe(`attachments/${att.storedPath}`)
  expect(query.get('dl')).toBe('Relatório final (v2).pdf')
  expect(verifyLocalUrl(T.ctx.storage, key, query)).toBe(true)
  expect((await T.ctx.storage.get(key)).length).toBe(20_971_520)
})

test('list traz origem; delete move para attachments-deleted; restoreMissing traz de volta', async () => {
  const { t, p } = await setup()
  const [att] = await addAttachments(T.ctx, { taskId: t.id, uploads: [await tempUpload(T.ctx.storage, 'foto.png', 'img')] })
  const [patt] = await addAttachments(T.ctx, { projectId: p.id, uploads: [await tempUpload(T.ctx.storage, 'contrato.docx', 'doc')] })
  const list = await listAttachments(T.ctx, {})
  expect(list.find((a) => a.id === att.id)).toMatchObject({ taskTitle: 'Tarefa', projectName: 'Proj', companyName: 'Pessoal', kind: 'image' })
  expect((await listAttachments(T.ctx, { projectId: p.id })).map((a) => a.id).sort()).toEqual([att.id, patt.id].sort())
  expect((await listAttachments(T.ctx, { kind: 'document' })).map((a) => a.id)).toEqual([patt.id])
  expect((await listAttachments(T.ctx, { text: 'contr' })).map((a) => a.id)).toEqual([patt.id])
  const live = `attachments/${att.storedPath}`
  const rel = att.storedPath
  await deleteAttachment(T.ctx, att.id)
  expect(await T.ctx.storage.exists(live)).toBe(false)
  expect(await T.ctx.storage.exists(`deleted/2026-11-25/${rel}`)).toBe(true)
  // simulate DB restore: row comes back, file is in deleted/
  await T.ctx.db.run('INSERT INTO attachments(id, task_id, original_name, stored_path) VALUES (?, ?, ?, ?)', [att.id, t.id, 'foto.png', rel])
  expect(await restoreMissingAttachments(T.ctx.storage, T.ctx.db)).toEqual({ restored: 1, missing: 0 })
  expect(await T.ctx.storage.exists(live)).toBe(true)
})

test('arquivo ausente → NOT_FOUND "Arquivo indisponível"', async () => {
  const { t } = await setup()
  const [att] = await addAttachments(T.ctx, { taskId: t.id, uploads: [await tempUpload(T.ctx.storage, 'x.txt', 'x')] })
  await T.ctx.storage.remove([`attachments/${att.storedPath}`])
  await expect(getAttachmentUrl(T.ctx, att.id)).rejects.toMatchObject({ code: 'NOT_FOUND' })
  expect(await restoreMissingAttachments(T.ctx.storage, T.ctx.db)).toEqual({ restored: 0, missing: 1 })
})

test('anexo aparece no índice de busca e miniatura de imagem', async () => {
  const { t } = await setup()
  const [att] = await addAttachments(T.ctx, { taskId: t.id, uploads: [await tempUpload(T.ctx.storage, 'orçamento.png', 'png')] })
  expect(await T.ctx.db.one("SELECT count(*) n FROM search_index WHERE norm LIKE '%orcamento%'")).toEqual({ n: 1 })
  const { key, query } = parseLocalUrl(await getAttachmentUrl(T.ctx, att.id))
  expect(verifyLocalUrl(T.ctx.storage, key, query)).toBe(true)
  expect(await text(key)).toBe('png')
})
