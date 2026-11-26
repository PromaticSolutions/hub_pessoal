// npm run build → .vercel/output (Vercel Build Output API v3):
//   static/                      Vite build of the renderer (SPA)
//   functions/api/rpc.func/      src/server/entries/rpc.ts  (esbuild, ESM, node)
//   functions/api/cron/daily.func/ src/server/entries/cron.ts
//   config.json                  filesystem → SPA fallback, daily cron
// Fails if a function bundle pulls in PGlite, local Storage or the dev API.
import { build as viteBuild } from 'vite'
import { build as esbuild } from 'esbuild'
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const out = join(root, '.vercel/output')
const rel = (p) => relative(root, p)

for (const k of ['SUPABASE_URL', 'SUPABASE_ANON_KEY']) {
  const has = (n) => !!process.env[n]?.trim() || envFileHas(n)
  if (!has(`VITE_${k}`) && !has(k)) console.warn(`[build] aviso: ${k} (ou VITE_${k}) não definida — o login não vai funcionar neste build.`)
}

function envFileHas(key) {
  for (const f of ['.env', '.env.local', '.env.production', '.env.production.local']) {
    try {
      if (new RegExp(`^\\s*${key}\\s*=\\s*\\S`, 'm').test(readFileSync(join(root, f), 'utf8'))) return true
    } catch {
      /* file absent */
    }
  }
  return false
}

rmSync(out, { recursive: true, force: true })

// 1. Static files.
await viteBuild({ configFile: join(root, 'vite.config.ts'), mode: 'production', logLevel: 'warn' })
cpSync(join(root, 'dist/web'), join(out, 'static'), { recursive: true })

// 2. Functions.
/** Vite-style `import text from './x.sql?raw'` → default export with the file contents. */
const rawPlugin = {
  name: 'raw',
  setup(b) {
    b.onResolve({ filter: /\?raw$/ }, (a) => ({ path: resolve(a.resolveDir, a.path.slice(0, -4)), namespace: 'raw' }))
    b.onLoad({ filter: /.*/, namespace: 'raw' }, (a) => ({ contents: readFileSync(a.path, 'utf8'), loader: 'text' }))
  }
}

const FORBIDDEN = [/@electric-sql[\\/]pglite/, /src[\\/]server[\\/]db[\\/]pglite/, /src[\\/]server[\\/]storage[\\/]local/, /src[\\/]server[\\/]context-dev/, /src[\\/]server[\\/]dev[\\/]/]

const functions = [
  { entry: 'src/server/entries/rpc.ts', dir: 'api/rpc.func' },
  { entry: 'src/server/entries/cron.ts', dir: 'api/cron/daily.func' }
]

for (const fn of functions) {
  const dir = join(out, 'functions', fn.dir)
  mkdirSync(dir, { recursive: true })
  const res = await esbuild({
    entryPoints: [join(root, fn.entry)],
    outfile: join(dir, 'index.mjs'),
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'node22',
    tsconfig: join(root, 'tsconfig.node.json'),
    plugins: [rawPlugin],
    metafile: true,
    legalComments: 'none',
    logLevel: 'warning',
    // CommonJS dependencies inside an ESM bundle still call require() for Node built-ins.
    banner: { js: "import { createRequire as __hubCreateRequire } from 'node:module'; const require = __hubCreateRequire(import.meta.url);" }
  })
  const bad = Object.keys(res.metafile.inputs).filter((p) => FORBIDDEN.some((re) => re.test(p)))
  const code = readFileSync(join(dir, 'index.mjs'), 'utf8')
  if (bad.length || /pglite/i.test(code)) {
    console.error(`[build] ${fn.entry}: o bundle contém código só de desenvolvimento:\n  ${bad.join('\n  ') || '(texto "pglite" no bundle)'}`)
    process.exit(1)
  }
  writeFileSync(
    join(dir, '.vc-config.json'),
    JSON.stringify({ runtime: 'nodejs22.x', handler: 'index.mjs', launcherType: 'Nodejs', shouldAddHelpers: false }, null, 2) + '\n'
  )
  console.log(`[build] ${rel(join(dir, 'index.mjs'))} (${(code.length / 1024).toFixed(0)} KB)`)
}

// 3. Routing + cron.
writeFileSync(
  join(out, 'config.json'),
  JSON.stringify(
    {
      version: 3,
      routes: [{ handle: 'filesystem' }, { src: '/(.*)', dest: '/index.html' }],
      crons: [{ path: '/api/cron/daily', schedule: '0 9 * * *' }]
    },
    null,
    2
  ) + '\n'
)
console.log(`[build] ${rel(out)} pronto.`)
