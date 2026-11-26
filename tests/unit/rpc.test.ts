import { handleRpc } from '@server/api/rpc'
import { createSupabaseAuth } from '@server/api/auth'
import { createProdContext } from '@server/context-prod'
import { createTestCtx } from '../helpers/ctx'

let T: Awaited<ReturnType<typeof createTestCtx>>
beforeEach(async () => { T = await createTestCtx() })
afterEach(() => T.cleanup())

// Fake Supabase: token "good" belongs to the allowed user, "other" to someone else.
const auth = createSupabaseAuth({
  url: 'http://supabase.invalid',
  anonKey: 'x',
  allowedEmail: 'Dono@Exemplo.com',
  getUser: async (token) => (token === 'good' ? { email: 'dono@exemplo.com' } : token === 'other' ? { email: 'intruso@exemplo.com' } : null)
})

const call = (body: unknown, token?: string) =>
  handleRpc(
    new Request('http://localhost/api/rpc', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: typeof body === 'string' ? body : JSON.stringify(body)
    }),
    { ctx: async () => T.ctx, auth }
  )

const UNAUTH = { ok: false, error: { code: 'UNAUTHORIZED', message: 'Sessão expirada. Entre novamente.' } }

test('sem token → 401 UNAUTHORIZED', async () => {
  const r = await call({ method: 'companies.list', input: {} })
  expect(r.status).toBe(401)
  expect(await r.json()).toEqual(UNAUTH)
})

test('email diferente do permitido → 401', async () => {
  const r = await call({ method: 'companies.list', input: {} }, 'other')
  expect(r.status).toBe(401)
  expect(await r.json()).toEqual(UNAUTH)
})

test('token válido → 200 com dados', async () => {
  const r = await call({ method: 'companies.list', input: {} }, 'good')
  expect(r.status).toBe(200)
  const env = await r.json()
  expect(env).toMatchObject({ ok: true })
  expect(env.data.map((c: { name: string }) => c.name)).toEqual(['Pessoal'])
})

test('corpo inválido → VALIDATION', async () => {
  for (const body of ['isto não é json', { input: {} }, { method: 'companies.get', input: { id: 'x' } }]) {
    expect(await (await call(body, 'good')).json()).toMatchObject({ ok: false, error: { code: 'VALIDATION' } })
  }
  expect(await (await call({ method: 'nao.existe', input: {} }, 'good')).json()).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } })
})

test('createProdContext com HUB_DEV_AUTH=1 lança', async () => {
  const env = { DATABASE_URL: 'postgres://u:p@localhost:1/db', SUPABASE_URL: 'http://supabase.invalid', SUPABASE_SERVICE_ROLE_KEY: 'k', ALLOWED_EMAIL: 'a@b.c' }
  await expect(createProdContext({ ...env, HUB_DEV_AUTH: '1' })).rejects.toThrow(/HUB_DEV_AUTH/)
  await expect(createProdContext({ ...env, ALLOWED_EMAIL: '' })).rejects.toThrow(/ALLOWED_EMAIL/)
})
