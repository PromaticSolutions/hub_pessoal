import { vi } from 'vitest'

vi.mock('../../src/renderer/lib/supabase', () => ({ getAccessToken: vi.fn(async () => 'tok-123') }))

import { api, ApiError } from '../../src/renderer/lib/api'
import { uploadFiles, MAX_UPLOAD_BYTES } from '../../src/renderer/lib/upload'

type Call = { url: string; init: RequestInit }

function stubFetch(responder: (call: Call) => Response | Promise<Response>) {
  const calls: Call[] = []
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
    const c = { url: String(url), init }
    calls.push(c)
    return responder(c)
  }))
  return calls
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const headersOf = (c: Call) => new Headers(c.init.headers)

let win: EventTarget
beforeEach(() => {
  win = new EventTarget()
  vi.stubGlobal('window', win)
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

test('api() faz POST /api/rpc com { method, input } e Bearer do Supabase', async () => {
  const calls = stubFetch(() => json({ ok: true, data: [{ id: 1 }] }))
  const r = await api('labels.list', {})
  expect(r).toEqual([{ id: 1 }])
  expect(calls).toHaveLength(1)
  expect(calls[0].url).toBe('/api/rpc')
  expect(calls[0].init.method).toBe('POST')
  expect(headersOf(calls[0]).get('authorization')).toBe('Bearer tok-123')
  expect(headersOf(calls[0]).get('content-type')).toBe('application/json')
  expect(JSON.parse(String(calls[0].init.body))).toEqual({ method: 'labels.list', input: {} })
})

test('com VITE_DEV_AUTH=1 não envia Authorization', async () => {
  vi.stubEnv('VITE_DEV_AUTH', '1')
  const calls = stubFetch(() => json({ ok: true, data: null }))
  await api('labels.list', {})
  expect(headersOf(calls[0]).has('authorization')).toBe(false)
})

test('401 lança ApiError UNAUTHORIZED e emite hub:unauthorized', async () => {
  stubFetch(() => json({ ok: false, error: { code: 'UNAUTHORIZED', message: 'Sessão expirada. Entre novamente.' } }, 401))
  const seen = vi.fn()
  win.addEventListener('hub:unauthorized', seen)
  const err = await api('labels.list', {}).catch((e) => e)
  expect(err).toBeInstanceOf(ApiError)
  expect(err.code).toBe('UNAUTHORIZED')
  expect(err.message).toBe('Sessão expirada. Entre novamente.')
  expect(seen).toHaveBeenCalledTimes(1)
})

test('401 sem corpo JSON também vira UNAUTHORIZED', async () => {
  stubFetch(() => new Response('nope', { status: 401 }))
  const seen = vi.fn()
  win.addEventListener('hub:unauthorized', seen)
  await expect(api('labels.list', {})).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
  expect(seen).toHaveBeenCalledTimes(1)
})

test('envelope ok:false lança ApiError com o código e a mensagem do servidor', async () => {
  stubFetch(() => json({ ok: false, error: { code: 'NOT_FOUND', message: 'Tarefa não encontrada' } }))
  const seen = vi.fn()
  win.addEventListener('hub:unauthorized', seen)
  const err = await api('labels.list', {}).catch((e) => e)
  expect(err).toBeInstanceOf(ApiError)
  expect(err.code).toBe('NOT_FOUND')
  expect(err.message).toBe('Tarefa não encontrada')
  expect(seen).not.toHaveBeenCalled()
})

test('falha de rede e resposta não JSON viram ApiError legível', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch') }))
  await expect(api('labels.list', {})).rejects.toMatchObject({ code: 'NETWORK' })
  stubFetch(() => new Response('<html>502</html>', { status: 502 }))
  await expect(api('labels.list', {})).rejects.toMatchObject({ code: 'INTERNAL' })
})

test('uploadFiles pede URL assinada e faz PUT do arquivo; devolve UploadRef', async () => {
  const calls = stubFetch((c) => {
    if (c.url === '/api/rpc') {
      const { input } = JSON.parse(String(c.init.body))
      return json({ ok: true, data: { key: `uploads/tmp/u1/${input.name}`, url: `https://storage.test/put/${encodeURIComponent(input.name)}` } })
    }
    return new Response(null, { status: 200 })
  })
  const f = new File(['%PDF-1.4 abc'], 'Relatório final (v2).pdf', { type: 'application/pdf' })
  const g = new File(['x'], 'semtipo.bin')
  const refs = await uploadFiles([f, g])
  expect(refs).toEqual([
    { key: 'uploads/tmp/u1/Relatório final (v2).pdf', name: 'Relatório final (v2).pdf', size: f.size, mime: 'application/pdf' },
    { key: 'uploads/tmp/u1/semtipo.bin', name: 'semtipo.bin', size: 1, mime: 'application/octet-stream' }
  ])
  const rpc = calls.filter((c) => c.url === '/api/rpc').map((c) => JSON.parse(String(c.init.body)))
  expect(rpc).toEqual([
    { method: 'files.uploadUrl', input: { name: 'Relatório final (v2).pdf' } },
    { method: 'files.uploadUrl', input: { name: 'semtipo.bin' } }
  ])
  const puts = calls.filter((c) => c.url.startsWith('https://storage.test/'))
  expect(puts).toHaveLength(2)
  expect(puts[0].init.method).toBe('PUT')
  expect(puts[0].init.body).toBe(f)
  expect(headersOf(puts[0]).get('content-type')).toBe('application/pdf')
  expect(headersOf(puts[1]).get('content-type')).toBe('application/octet-stream')
  expect(headersOf(puts[0]).has('authorization')).toBe(false)
})

test('uploadFiles recusa arquivo > 50 MB antes de qualquer requisição', async () => {
  const calls = stubFetch(() => json({ ok: true, data: null }))
  const big = new File(['x'], 'grande.zip')
  Object.defineProperty(big, 'size', { value: MAX_UPLOAD_BYTES + 1 })
  await expect(uploadFiles([new File(['a'], 'ok.txt'), big])).rejects.toThrow('Arquivo maior que 50 MB')
  expect(calls).toHaveLength(0)
})

test('uploadFiles falha legível quando o PUT dá erro', async () => {
  stubFetch((c) => (c.url === '/api/rpc' ? json({ ok: true, data: { key: 'uploads/tmp/u/a.txt', url: 'https://storage.test/a' } }) : new Response('x', { status: 403 })))
  await expect(uploadFiles([new File(['a'], 'a.txt')])).rejects.toMatchObject({ code: 'UPLOAD_FAILED' })
})
