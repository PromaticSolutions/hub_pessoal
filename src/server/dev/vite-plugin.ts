// Vite dev middleware: /api/rpc, /api/dev-files/* and /api/dev/reset backed by PGlite + local Storage.
// Self-contained: server modules are loaded through Vite's SSR loader (handles `?raw` and aliases),
// so the Vite config bundle only contains this file. Server code changes need a dev server restart.
import type { IncomingMessage, ServerResponse } from 'node:http'
import { fileURLToPath } from 'node:url'
import { loadEnv, type Plugin, type ViteDevServer } from 'vite'
import type { DevApi, DevEnv } from './dev-api'

const DEV_API = fileURLToPath(new URL('./dev-api.ts', import.meta.url))
const ALIASES = {
  '@shared': fileURLToPath(new URL('../../shared', import.meta.url)),
  '@server': fileURLToPath(new URL('..', import.meta.url))
}
const RPC_LIMIT = 8 * 1024 * 1024
const FILE_LIMIT = 51 * 1024 * 1024

function readBody(req: IncomingMessage, limit: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    req.on('data', (c: Buffer) => {
      size += c.length
      if (size > limit) {
        reject(Object.assign(new Error('too large'), { status: 413 }))
        req.destroy()
      } else chunks.push(c)
    })
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

function send(res: ServerResponse, status: number, headers: Record<string, string>, body: Uint8Array | string) {
  res.writeHead(status, headers)
  res.end(body)
}

export function hubDevApi(opts: { dataDir: string }): Plugin {
  let api: Promise<DevApi> | undefined
  const load = (server: ViteDevServer) =>
    (api ??= (async () => {
      const env: DevEnv = { ...loadEnv(server.config.mode, server.config.envDir || server.config.root, ''), ...process.env }
      const mod = (await server.ssrLoadModule(DEV_API)) as typeof import('./dev-api')
      const a = mod.createDevApi({ dataDir: opts.dataDir, env })
      if (a.devAuth) server.config.logger.warn('[hub] HUB_DEV_AUTH=1: login dispensado (só no dev).')
      return a
    })().catch((e) => { api = undefined; throw e }))

  return {
    name: 'hub-dev-api',
    apply: 'serve',
    config: () => ({ resolve: { alias: ALIASES } }),
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url ?? '/', 'http://localhost')
        const path = url.pathname
        try {
          if (path === '/api/rpc') {
            const body = req.method === 'POST' ? await readBody(req, RPC_LIMIT) : undefined
            const headers = new Headers()
            for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v)
            const r = await (await load(server)).rpc(new Request(url, { method: req.method, headers, body: body ? new Uint8Array(body) : undefined }))
            send(res, r.status, Object.fromEntries(r.headers), Buffer.from(await r.arrayBuffer()))
            return
          }
          if (path.startsWith('/api/dev-files/')) {
            const method = (req.method ?? 'GET').toUpperCase()
            if (!['GET', 'HEAD', 'PUT'].includes(method)) return send(res, 405, {}, '')
            const key = path.slice('/api/dev-files/'.length).split('/').map(decodeURIComponent).join('/')
            const body = method === 'PUT' ? await readBody(req, FILE_LIMIT) : undefined
            const r = await (await load(server)).file(method, key, url.searchParams, body)
            return send(res, r.status, r.headers, r.body)
          }
          if (path === '/api/dev/reset') {
            const a = await load(server)
            if (!a.e2e || req.method !== 'POST') return send(res, 404, {}, '')
            await a.reset()
            return send(res, 200, { 'content-type': 'application/json' }, '{"ok":true}')
          }
        } catch (e) {
          const status = (e as { status?: number }).status ?? 500
          server.config.logger.error(`[hub] ${path}: ${e instanceof Error ? e.stack ?? e.message : String(e)}`)
          if (!res.headersSent) send(res, status, { 'content-type': 'text/plain; charset=utf-8' }, status === 413 ? 'Arquivo grande demais.' : 'Erro no servidor de desenvolvimento.')
          return
        }
        next()
      })
    }
  }
}
