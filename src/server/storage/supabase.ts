/**
 * Storage on a Supabase Storage bucket through its REST API (service role key; server only).
 *
 * Supabase only accepts ASCII object names, while our keys keep the original file name
 * (`attachments/2026/11/<uuid>-Relatório final.pdf`). Keys are therefore stored encoded:
 * letters, digits, space, `_ - . ( ) /` are kept and every other character becomes `!XX` per UTF-8
 * byte (`ó` → `!C3!B3`, `!` → `!21`). `!` is used because Supabase rejects signed URLs whose object
 * name has characters it percent-encodes (`+ = @ & , ; $ :`). The mapping is reversible, so every method takes and returns
 * the logical key; only the bucket browser in the Supabase dashboard shows the encoded name.
 */
import { AppError } from '../lib/errors'
import { checkKey } from './keys'
import { SIGNED_URL_TTL_SECONDS, type Storage } from './storage'

export const HUB_BUCKET = 'hub-files'
export const MAX_FILE_BYTES = 50 * 1024 * 1024

const KEEP = /[A-Za-z0-9 _\-.()/]/

/** Logical key → object name accepted by Supabase. */
export function encodeStorageKey(key: string): string {
  let out = ''
  for (const ch of key) {
    if (KEEP.test(ch)) out += ch
    else for (const b of Buffer.from(ch, 'utf8')) out += `!${b.toString(16).toUpperCase().padStart(2, '0')}`
  }
  return out
}

/** Object name → logical key (inverse of encodeStorageKey). */
export function decodeStorageKey(name: string): string {
  // Encoded names never contain a literal `%`, so `!XX` → `%XX` is unambiguous.
  if (name.includes('%')) return name // not written by this module
  try {
    return decodeURIComponent(name.replace(/!([0-9A-F]{2})/g, '%$1'))
  } catch {
    return name
  }
}

const urlPath = (name: string) => name.split('/').map(encodeURIComponent).join('/')

type Fetch = typeof fetch

export function createSupabaseStorage(url: string, serviceKey: string, bucket = HUB_BUCKET, fetchImpl: Fetch = fetch): Storage {
  const api = `${url.replace(/\/+$/, '')}/storage/v1`
  const auth = { authorization: `Bearer ${serviceKey}`, apikey: serviceKey }
  const obj = (key: string) => `${api}/object/${bucket}/${urlPath(encodeStorageKey(checkKey(key)))}`

  async function call(path: string, init: RequestInit & { json?: unknown } = {}): Promise<Response> {
    const headers: Record<string, string> = { ...auth, ...(init.headers as Record<string, string>) }
    let body = init.body
    if (init.json !== undefined) {
      headers['content-type'] = 'application/json'
      body = JSON.stringify(init.json)
    }
    let last: unknown
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await fetchImpl(path.startsWith('http') ? path : `${api}${path}`, { ...init, headers, body })
        if (res.status < 500 || attempt === 2) return res
        last = new Error(`HTTP ${res.status}`)
      } catch (e) {
        last = e
      }
      await new Promise((r) => setTimeout(r, 300 * (attempt + 1)))
    }
    throw new AppError('INTERNAL', `Falha ao acessar o armazenamento: ${last instanceof Error ? last.message : String(last)}`)
  }

  async function errorOf(res: Response): Promise<{ notFound: boolean; message: string }> {
    let info: { statusCode?: string | number; error?: string; message?: string; code?: string } = {}
    try { info = (await res.json()) as typeof info } catch { /* empty body (HEAD) */ }
    const notFound = res.status === 404 || String(info.statusCode) === '404' || info.error === 'not_found' || info.code === 'NoSuchKey'
    return { notFound, message: `${res.status} ${info.code ?? info.error ?? ''} ${info.message ?? ''}`.trim() }
  }

  const fail = (what: string, message: string) => new AppError('INTERNAL', `Armazenamento: ${what} falhou (${message}).`)
  const notFound = (key: string) => new AppError('NOT_FOUND', `Arquivo não encontrado: ${key.split('/').pop()}`)

  async function ok(res: Response, what: string, key?: string): Promise<Response> {
    if (res.ok) return res
    const e = await errorOf(res)
    if (e.notFound && key !== undefined) throw notFound(key)
    throw fail(what, e.message)
  }

  async function exists(key: string): Promise<boolean> {
    const res = await call(obj(key), { method: 'HEAD' })
    if (res.ok) return true
    if (res.status === 400 || res.status === 404) return false
    throw fail('consulta', String(res.status))
  }

  async function remove(keys: string[]): Promise<void> {
    const names = keys.map((k) => encodeStorageKey(checkKey(k)))
    for (let i = 0; i < names.length; i += 1000) {
      await ok(await call(`/object/${bucket}`, { method: 'DELETE', json: { prefixes: names.slice(i, i + 1000) } }), 'exclusão')
    }
  }

  /** Copy or move; Supabase refuses an existing destination, so it is removed first. */
  async function transfer(op: 'copy' | 'move', from: string, to: string): Promise<void> {
    checkKey(to)
    if (from === to) {
      if (!(await exists(from))) throw notFound(from)
      return
    }
    if (!(await exists(from))) throw notFound(from)
    await remove([to])
    const json = { bucketId: bucket, sourceKey: encodeStorageKey(from), destinationKey: encodeStorageKey(to) }
    await ok(await call(`/object/${op}`, { method: 'POST', json }), op === 'copy' ? 'cópia' : 'movimentação', from)
  }

  return {
    async put(key, data, contentType = 'application/octet-stream') {
      const res = await call(obj(key), {
        method: 'POST',
        headers: { 'content-type': contentType, 'x-upsert': 'true', 'cache-control': 'max-age=3600' },
        body: data as unknown as BodyInit
      })
      await ok(res, 'envio')
    },
    async get(key) {
      const res = await ok(await call(obj(key)), 'leitura', key)
      return new Uint8Array(await res.arrayBuffer())
    },
    exists,
    async copy(from, to) {
      await transfer('copy', checkKey(from), to)
    },
    async move(from, to) {
      await transfer('move', checkKey(from), to)
    },
    remove,
    async list(prefix) {
      if (prefix.startsWith('/') || prefix.split('/').some((s) => s === '.' || s === '..')) {
        throw new AppError('VALIDATION', 'Caminho de arquivo inválido.')
      }
      // Walk the deepest folder implied by the prefix, then filter by the full (logical) prefix.
      const dir = prefix.includes('/') ? prefix.slice(0, prefix.lastIndexOf('/')) : ''
      const out: { key: string; size: number; updatedAt: string }[] = []
      const walk = async (folder: string) => {
        for (let offset = 0; ; offset += 1000) {
          const res = await ok(
            await call(`/object/list/${bucket}`, {
              method: 'POST',
              json: { prefix: folder, limit: 1000, offset, sortBy: { column: 'name', order: 'asc' } }
            }),
            'listagem'
          )
          const items = (await res.json()) as { name: string; id: string | null; updated_at?: string; metadata?: { size?: number } | null }[]
          for (const it of items) {
            const name = folder ? `${folder}/${it.name}` : it.name
            if (it.id === null) await walk(name)
            else out.push({ key: decodeStorageKey(name), size: Number(it.metadata?.size ?? 0), updatedAt: new Date(it.updated_at ?? 0).toISOString() })
          }
          if (items.length < 1000) break
        }
      }
      await walk(encodeStorageKey(dir))
      return out.filter((f) => f.key.startsWith(prefix)).sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
    },
    async signedUrl(key, opts) {
      const res = await ok(
        await call(`/object/sign/${bucket}/${urlPath(encodeStorageKey(checkKey(key)))}`, { method: 'POST', json: { expiresIn: SIGNED_URL_TTL_SECONDS } }),
        'link',
        key
      )
      const { signedURL } = (await res.json()) as { signedURL: string }
      const dl = opts?.downloadName ? `&download=${encodeURIComponent(opts.downloadName)}` : ''
      return `${api}${signedURL}${dl}`
    },
    async signedUploadUrl(key) {
      // Supabase fixes the validity of upload links (2 h); the browser PUTs the file to it.
      const res = await ok(
        await call(`/object/upload/sign/${bucket}/${urlPath(encodeStorageKey(checkKey(key)))}`, { method: 'POST', headers: { 'x-upsert': 'true' } }),
        'link de envio'
      )
      const { url: path } = (await res.json()) as { url: string }
      return `${api}${path}`
    }
  }
}

/** Creates the private bucket (50 MB per file) if missing; makes an existing one private with that limit. */
export async function ensureSupabaseBucket(url: string, serviceKey: string, bucket = HUB_BUCKET, fetchImpl: Fetch = fetch): Promise<'created' | 'exists'> {
  const api = `${url.replace(/\/+$/, '')}/storage/v1`
  const headers = { authorization: `Bearer ${serviceKey}`, apikey: serviceKey, 'content-type': 'application/json' }
  const config = { public: false, file_size_limit: MAX_FILE_BYTES }
  const got = await fetchImpl(`${api}/bucket/${bucket}`, { headers })
  if (got.ok) {
    const b = (await got.json()) as { public?: boolean; file_size_limit?: number | null }
    if (b.public !== false || b.file_size_limit !== MAX_FILE_BYTES) {
      const upd = await fetchImpl(`${api}/bucket/${bucket}`, { method: 'PUT', headers, body: JSON.stringify(config) })
      if (!upd.ok) throw new AppError('INTERNAL', `Armazenamento: ajuste do bucket falhou (${upd.status}).`)
    }
    return 'exists'
  }
  const res = await fetchImpl(`${api}/bucket`, { method: 'POST', headers, body: JSON.stringify({ id: bucket, name: bucket, ...config }) })
  if (!res.ok) throw new AppError('INTERNAL', `Armazenamento: criação do bucket falhou (${res.status} ${(await res.text()).slice(0, 200)}).`)
  return 'created'
}
