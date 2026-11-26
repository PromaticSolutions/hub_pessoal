import {
  listCompanies, getCompany, createCompany, updateCompany, archiveCompany, restoreCompany,
  getCompanyDeletionImpact, deleteCompany, reorderCompany, setCompanyLogo
} from '@server/services/companies'
import { createTestCtx, tempUpload } from '../helpers/ctx'

let T: Awaited<ReturnType<typeof createTestCtx>>
beforeEach(async () => { T = await createTestCtx() })
afterEach(() => T.cleanup())

async function seedTask(companyId: number, due: string | null, category: 'todo' | 'done' = 'todo') {
  const db = T.ctx.db
  const p = (await db.one<{ id: number }>("INSERT INTO projects(company_id, name, color) VALUES (?, 'P', '#000') RETURNING id", [companyId]))!.id
  const b = (await db.one<{ id: number }>("INSERT INTO boards(project_id, name) VALUES (?, 'B') RETURNING id", [p]))!.id
  const c = (await db.one<{ id: number }>("INSERT INTO columns(board_id, name, category) VALUES (?, 'C', ?) RETURNING id", [b, category]))!.id
  const t = (await db.one<{ id: number }>("INSERT INTO tasks(board_id, column_id, title, due_at) VALUES (?, ?, 'T', ?) RETURNING id", [b, c, due]))!.id
  return { p: Number(p), b: Number(b), c: Number(c), t: Number(t) }
}

test('cria e edita empresa', async () => {
  const c = await createCompany(T.ctx, { name: 'Empresa A', color: '#ff0000', description: 'x' })
  expect(c).toMatchObject({ name: 'Empresa A', color: '#ff0000', isPersonal: false, status: 'active' })
  expect((await updateCompany(T.ctx, c.id, { name: 'Empresa B' })).name).toBe('Empresa B')
  expect((await getCompany(T.ctx, c.id)).description).toBe('x')
})

test('nome vazio → VALIDATION', async () => {
  await expect(createCompany(T.ctx, { name: '  ', color: '#000' })).rejects.toMatchObject({ code: 'VALIDATION' })
})

test('arquivar e restaurar; Pessoal não arquiva nem exclui', async () => {
  const c = await createCompany(T.ctx, { name: 'A', color: '#000' })
  expect((await archiveCompany(T.ctx, c.id)).status).toBe('archived')
  expect((await listCompanies(T.ctx, {})).map((x) => x.id)).not.toContain(c.id)
  expect((await listCompanies(T.ctx, { includeArchived: true })).map((x) => x.id)).toContain(c.id)
  expect((await restoreCompany(T.ctx, c.id)).status).toBe('active')
  const pessoal = (await listCompanies(T.ctx, {}))[0]
  expect(pessoal.isPersonal).toBe(true)
  await expect(archiveCompany(T.ctx, pessoal.id)).rejects.toMatchObject({ code: 'FORBIDDEN' })
  await expect(deleteCompany(T.ctx, pessoal.id)).rejects.toMatchObject({ code: 'FORBIDDEN' })
})

test('listCompanies conta abertas e atrasadas; Pessoal primeiro', async () => {
  const c = await createCompany(T.ctx, { name: 'A', color: '#000' })
  await seedTask(c.id, '2026-11-20')
  await seedTask(c.id, '2026-11-30')
  await seedTask(c.id, '2026-11-01', 'done')
  const list = await listCompanies(T.ctx, {})
  expect(list[0].isPersonal).toBe(true)
  expect(list.find((x) => x.id === c.id)).toMatchObject({ activeProjects: 3, openTasks: 2, overdueTasks: 1 })
})

test('deletionImpact e delete movem anexo para deleted/ no Storage', async () => {
  const c = await createCompany(T.ctx, { name: 'A', color: '#000' })
  const s = await seedTask(c.id, null)
  await T.ctx.db.run("INSERT INTO attachments(task_id, original_name, stored_path) VALUES (?, 'a.txt', '2026/11/x-a.txt')", [s.t])
  await T.ctx.storage.put('attachments/2026/11/x-a.txt', new TextEncoder().encode('hello'))
  expect(await getCompanyDeletionImpact(T.ctx, c.id)).toEqual({ projects: 1, tasks: 1, attachments: 1 })
  await deleteCompany(T.ctx, c.id)
  await expect(getCompany(T.ctx, c.id)).rejects.toMatchObject({ code: 'NOT_FOUND' })
  expect(await T.ctx.storage.exists('attachments/2026/11/x-a.txt')).toBe(false)
  expect(new TextDecoder().decode(await T.ctx.storage.get('deleted/2026-11-25/2026/11/x-a.txt'))).toBe('hello')
})

test('setCompanyLogo copia arquivo e troca o anterior', async () => {
  const c = await createCompany(T.ctx, { name: 'A', color: '#000' })
  const a = await setCompanyLogo(T.ctx, c.id, await tempUpload(T.ctx.storage, 'logo.png', 'one'))
  expect(a.logoPath).toMatch(/^logos\//)
  const first = a.logoPath!
  expect(new TextDecoder().decode(await T.ctx.storage.get(first))).toBe('one')
  const b = await setCompanyLogo(T.ctx, c.id, await tempUpload(T.ctx.storage, 'logo2.png', 'two'))
  expect(await T.ctx.storage.exists(first)).toBe(false)
  expect(new TextDecoder().decode(await T.ctx.storage.get(b.logoPath!))).toBe('two')
  expect((await setCompanyLogo(T.ctx, c.id, null)).logoPath).toBeNull()
})

test('reorderCompany muda a ordem', async () => {
  const a = await createCompany(T.ctx, { name: 'A', color: '#000' })
  const b = await createCompany(T.ctx, { name: 'B', color: '#000' })
  await reorderCompany(T.ctx, b.id, { beforeId: null, afterId: a.id })
  const names = (await listCompanies(T.ctx, {})).filter((x) => !x.isPersonal).map((x) => x.name)
  expect(names).toEqual(['B', 'A'])
})
