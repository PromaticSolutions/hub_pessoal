import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createLocalStorage, verifyLocalUrl } from '@server/storage/local'
import type { Storage } from '@server/storage/storage'

let root: string
let st: Storage
const enc = (s: string) => new TextEncoder().encode(s)
const dec = (b: Uint8Array) => new TextDecoder().decode(b)

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'pth-storage-'))
  st = createLocalStorage(root)
})
afterEach(() => {
  vi.useRealTimers()
  rmSync(root, { recursive: true, force: true })
})

/** Splits a local signed URL into the decoded key and its query string. */
function parse(url: string): { key: string; query: URLSearchParams } {
  const u = new URL(url, 'http://localhost')
  expect(u.pathname.startsWith('/api/dev-files/')).toBe(true)
  const key = u.pathname.slice('/api/dev-files/'.length).split('/').map(decodeURIComponent).join('/')
  return { key, query: u.searchParams }
}

test('put/get/exists/copy/move/remove/list', async () => {
  const name = 'attachments/2026/11/abc-Relatório final (v2).pdf'
  await st.put(name, enc('conteúdo'), 'application/pdf')
  expect(dec(await st.get(name))).toBe('conteúdo')
  expect(await st.exists(name)).toBe(true)
  expect(await st.exists('attachments/nada.txt')).toBe(false)

  await st.copy(name, 'attachments/copia.pdf')
  expect(dec(await st.get('attachments/copia.pdf'))).toBe('conteúdo')
  await st.move('attachments/copia.pdf', 'deleted/2026/copia.pdf')
  expect(await st.exists('attachments/copia.pdf')).toBe(false)
  expect(dec(await st.get('deleted/2026/copia.pdf'))).toBe('conteúdo')

  await st.put('backups/auto/b1.json', enc('{}'))
  const list = await st.list('attachments/')
  expect(list).toEqual([{ key: name, size: enc('conteúdo').byteLength, updatedAt: expect.stringMatching(/^\d{4}-\d\d-\d\dT.*Z$/) }])
  expect((await st.list('')).map((f) => f.key)).toEqual(['attachments/2026/11/abc-Relatório final (v2).pdf', 'backups/auto/b1.json', 'deleted/2026/copia.pdf'])
  expect(await st.list('logos/')).toEqual([])

  await st.remove([name, 'deleted/2026/copia.pdf', 'nao/existe.txt'])
  expect(await st.exists(name)).toBe(false)
  expect((await st.list('')).map((f) => f.key)).toEqual(['backups/auto/b1.json'])
})

test('get/copy de chave inexistente lança NOT_FOUND; put sobrescreve', async () => {
  await expect(st.get('attachments/x.txt')).rejects.toMatchObject({ code: 'NOT_FOUND' })
  await expect(st.copy('attachments/x.txt', 'attachments/y.txt')).rejects.toMatchObject({ code: 'NOT_FOUND' })
  await st.put('a/b.txt', enc('1'))
  await st.put('a/b.txt', enc('22'))
  expect(dec(await st.get('a/b.txt'))).toBe('22')
})

test('chave com .. ou absoluta é recusada', async () => {
  for (const bad of ['../fora.txt', 'attachments/../../fora.txt', '/etc/passwd', 'a//b', '', 'a\\b']) {
    await expect(st.put(bad, enc('x'))).rejects.toMatchObject({ code: 'VALIDATION' })
    await expect(st.get(bad)).rejects.toMatchObject({ code: 'VALIDATION' })
    await expect(st.signedUrl(bad)).rejects.toMatchObject({ code: 'VALIDATION' })
  }
  await expect(st.copy('a.txt', '../b.txt')).rejects.toMatchObject({ code: 'VALIDATION' })
  // ".." inside a file name (not a path segment) is a legitimate name
  await st.put('attachments/v1..2.pdf', enc('ok'))
  expect(await st.exists('attachments/v1..2.pdf')).toBe(true)
})

test('URL assinada válida passa em verifyLocalUrl; adulterada ou expirada falha', async () => {
  const key = 'attachments/2026/11/abc-Relatório final (v2).pdf'
  await st.put(key, enc('pdf'))
  const url = await st.signedUrl(key, { downloadName: 'Relatório final (v2).pdf' })
  const { key: k, query } = parse(url)
  expect(k).toBe(key)
  expect(query.get('dl')).toBe('Relatório final (v2).pdf')
  expect(verifyLocalUrl(st, key, query)).toBe(true)
  expect(verifyLocalUrl(st, key, Object.fromEntries(query))).toBe(true)

  expect(verifyLocalUrl(st, 'attachments/outro.pdf', query)).toBe(false)
  const badSig = new URLSearchParams(query); badSig.set('sig', badSig.get('sig')!.replace(/^./, (c) => (c === 'A' ? 'B' : 'A')))
  expect(verifyLocalUrl(st, key, badSig)).toBe(false)
  const laterExp = new URLSearchParams(query); laterExp.set('exp', String(Number(query.get('exp')) + 1000))
  expect(verifyLocalUrl(st, key, laterExp)).toBe(false)
  const otherName = new URLSearchParams(query); otherName.set('dl', 'x.exe')
  expect(verifyLocalUrl(st, key, otherName)).toBe(false)
  expect(verifyLocalUrl(st, key, {})).toBe(false)
  // a download URL does not authorise an upload
  expect(verifyLocalUrl(st, key, query, 'PUT')).toBe(false)
  // the secret is per process, so another local storage instance in this process accepts it
  expect(verifyLocalUrl(createLocalStorage(root), key, query)).toBe(true)

  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(Date.now() + 3601 * 1000)
  expect(verifyLocalUrl(st, key, query)).toBe(false)
})

test('URL de upload: assinada para PUT, expira em 3600 s', async () => {
  const key = 'uploads/tmp/u1-arquivo.bin'
  const url = await st.signedUploadUrl(key)
  const { key: k, query } = parse(url)
  expect(k).toBe(key)
  const exp = Number(query.get('exp'))
  expect(exp - Math.floor(Date.now() / 1000)).toBeGreaterThan(3590)
  expect(exp - Math.floor(Date.now() / 1000)).toBeLessThanOrEqual(3600)
  expect(verifyLocalUrl(st, key, query, 'PUT')).toBe(true)
  expect(verifyLocalUrl(st, key, query, 'GET')).toBe(false)
})
