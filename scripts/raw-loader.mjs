// Node module hooks for the scripts (run with `tsx --import ./scripts/raw-loader.mjs`):
// support Vite-style `import text from './file.sql?raw'` (default export = file contents),
// both when tsx loads the .ts files as CommonJS (package without "type": "module") and as ESM.
import { readFileSync } from 'node:fs'
import Module, { register } from 'node:module'

if (!globalThis.__pthRawLoader) {
  globalThis.__pthRawLoader = true

  // CommonJS: tsx hands the .sql file (possibly with its `?raw` query) to Module#_compile as code.
  const isSql = (f) => /\.sql(\?raw)?$/.test(f)
  const compile = Module.prototype._compile
  Module.prototype._compile = function (content, filename) {
    if (!isSql(filename)) return compile.call(this, content, filename)
    this.exports = { __esModule: true, default: readFileSync(filename.replace(/\?raw$/, ''), 'utf8') }
  }

  // ESM.
  register(
    'data:text/javascript,' +
      encodeURIComponent(`
        import { readFile } from 'node:fs/promises'
        export async function resolve(specifier, context, next) {
          if (!specifier.endsWith('?raw')) return next(specifier, context)
          const r = await next(specifier.slice(0, -4), context)
          return { url: r.url + '?raw', shortCircuit: true }
        }
        export async function load(url, context, next) {
          if (!url.endsWith('?raw')) return next(url, context)
          const text = await readFile(new URL(url.slice(0, -4)), 'utf8')
          return { format: 'module', source: 'export default ' + JSON.stringify(text), shortCircuit: true }
        }
      `),
    import.meta.url
  )
}
