// Dev/test only: production never imports this module (it uses Supabase Storage).
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { copyFile, mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { AppError } from '../lib/errors'
import { checkKey } from './keys'
import { SIGNED_URL_TTL_SECONDS, type Storage } from './storage'

/** Random per-process secret: signed local URLs stop working when the dev server restarts. */
const SECRET = randomBytes(32)
const instances = new WeakSet<Storage>()

type Op = 'GET' | 'PUT'

function sign(op: Op, key: string, exp: number, dl: string): string {
  return createHmac('sha256', SECRET).update(`${op}\n${key}\n${exp}\n${dl}`).digest('base64url')
}

const isMissing = (e: unknown) => (e as NodeJS.ErrnoException)?.code === 'ENOENT'
const notFound = (key: string) => new AppError('NOT_FOUND', `Arquivo não encontrado: ${key.split('/').pop()}`)

/**
 * Storage on local disk under `root`. Signed URLs are `baseUrl/<key>?exp=…&sig=…`
 * (plus `dl=<name>` for downloads, `op=put` for uploads), checked by `verifyLocalUrl`.
 */
export function createLocalStorage(root: string, baseUrl = '/api/dev-files'): Storage {
  const base = resolve(root)
  const pathOf = (key: string): string => join(base, ...checkKey(key).split('/'))

  async function writeAtomic(file: string, data: Uint8Array) {
    await mkdir(dirname(file), { recursive: true })
    const part = `${file}.${randomBytes(4).toString('hex')}.part`
    try {
      await writeFile(part, data)
      await rename(part, file)
    } catch (e) {
      await rm(part, { force: true })
      throw e
    }
  }

  async function walk(dir: string, out: { key: string; size: number; updatedAt: string }[]) {
    let entries
    try { entries = await readdir(dir, { withFileTypes: true }) } catch (e) { if (isMissing(e)) return; throw e }
    for (const ent of entries) {
      const abs = join(dir, ent.name)
      if (ent.isDirectory()) await walk(abs, out)
      else if (ent.isFile() && !ent.name.endsWith('.part')) {
        const s = await stat(abs)
        out.push({ key: relative(base, abs).split(sep).join('/'), size: s.size, updatedAt: s.mtime.toISOString() })
      }
    }
  }

  function url(op: Op, key: string, dl = ''): string {
    checkKey(key)
    const exp = Math.floor(Date.now() / 1000) + SIGNED_URL_TTL_SECONDS
    const q = new URLSearchParams()
    if (op === 'PUT') q.set('op', 'put')
    if (dl) q.set('dl', dl)
    q.set('exp', String(exp))
    q.set('sig', sign(op, key, exp, dl))
    return `${baseUrl}/${key.split('/').map(encodeURIComponent).join('/')}?${q}`
  }

  const storage: Storage = {
    async put(key, data) {
      await writeAtomic(pathOf(key), data)
    },
    async get(key) {
      try {
        return new Uint8Array(await readFile(pathOf(key)))
      } catch (e) {
        if (isMissing(e)) throw notFound(key)
        throw e
      }
    },
    async exists(key) {
      try { return (await stat(pathOf(key))).isFile() } catch (e) { if (isMissing(e)) return false; throw e }
    },
    async copy(from, to) {
      const src = pathOf(from)
      const dest = pathOf(to)
      await mkdir(dirname(dest), { recursive: true })
      try { await copyFile(src, dest) } catch (e) { if (isMissing(e)) throw notFound(from); throw e }
    },
    async move(from, to) {
      const src = pathOf(from)
      const dest = pathOf(to)
      await mkdir(dirname(dest), { recursive: true })
      try { await rename(src, dest) } catch (e) { if (isMissing(e)) throw notFound(from); throw e }
    },
    async remove(keys) {
      const paths = keys.map(pathOf)
      for (const p of paths) await rm(p, { force: true })
    },
    async list(prefix) {
      if (prefix.startsWith('/') || prefix.split('/').some((s) => s === '.' || s === '..')) {
        throw new AppError('VALIDATION', 'Caminho de arquivo inválido.')
      }
      // Walk the deepest directory implied by the prefix, then filter by the full prefix.
      const dirPart = prefix.includes('/') ? prefix.slice(0, prefix.lastIndexOf('/')) : ''
      const out: { key: string; size: number; updatedAt: string }[] = []
      await walk(dirPart ? join(base, ...dirPart.split('/')) : base, out)
      return out.filter((f) => f.key.startsWith(prefix)).sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
    },
    async signedUrl(key, opts) {
      return url('GET', key, opts?.downloadName ?? '')
    },
    async signedUploadUrl(key) {
      return url('PUT', key)
    }
  }
  instances.add(storage)
  return storage
}

/**
 * Checks a local signed URL (for the dev file middleware): `key` is the decoded path after
 * `baseUrl/`, `query` its query string, `method` the HTTP method (PUT needs an upload URL).
 */
export function verifyLocalUrl(
  storage: Storage,
  key: string,
  query: URLSearchParams | Record<string, string | string[] | undefined>,
  method: string = 'GET'
): boolean {
  if (!instances.has(storage)) return false
  const get = (k: string): string | undefined => {
    const v = query instanceof URLSearchParams ? query.get(k) ?? undefined : query[k]
    return Array.isArray(v) ? v[0] : v
  }
  try { checkKey(key) } catch { return false }
  const m = method.toUpperCase()
  const op: Op | undefined = get('op') === 'put' ? 'PUT' : get('op') === undefined ? 'GET' : undefined
  if (!op || (m === 'HEAD' ? 'GET' : m) !== op) return false
  const exp = Number(get('exp'))
  const sig = get('sig')
  if (!Number.isInteger(exp) || !sig || exp < Math.floor(Date.now() / 1000)) return false
  const expected = Buffer.from(sign(op, key, exp, get('dl') ?? ''))
  const given = Buffer.from(sig)
  return given.length === expected.length && timingSafeEqual(given, expected)
}
