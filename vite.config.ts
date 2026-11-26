import { fileURLToPath } from 'node:url'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { hubDevApi } from './src/server/dev/vite-plugin'

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url))

/** Dev only: the CSP meta blocks Vite's inline React-refresh preamble; production keeps it. */
const devCsp = (): Plugin => ({
  name: 'hub-dev-csp',
  apply: 'serve',
  transformIndexHtml: (html) => html.replace(/\s*<meta http-equiv="Content-Security-Policy"[^>]*>/, '')
})

/**
 * The renderer needs the public Supabase URL and anon key. `VITE_*` wins; otherwise they come from the
 * server's `SUPABASE_URL` / `SUPABASE_ANON_KEY` (both public), so Vercel needs no duplicated variables.
 */
function publicSupabaseEnv(mode: string): Record<string, string> {
  const env = loadEnv(mode, r('.'), '')
  const out: Record<string, string> = {}
  const url = env.VITE_SUPABASE_URL || env.SUPABASE_URL
  const anon = env.VITE_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY
  if (url) out['import.meta.env.VITE_SUPABASE_URL'] = JSON.stringify(url)
  if (anon) out['import.meta.env.VITE_SUPABASE_ANON_KEY'] = JSON.stringify(anon)
  return out
}

export default defineConfig(({ command, mode }) => ({
  root: r('src/renderer'),
  define: publicSupabaseEnv(mode),
  publicDir: r('src/renderer/public'),
  envDir: r('.'),
  resolve: {
    alias: {
      '@shared': r('src/shared'),
      '@server': r('src/server'),
      '@renderer': r('src/renderer')
    }
  },
  plugins: [
    react(),
    tailwindcss(),
    ...(command === 'serve' ? [devCsp(), hubDevApi({ dataDir: process.env.HUB_DATA_DIR ?? '.data/dev' })] : [])
  ],
  build: { outDir: r('dist/web'), emptyOutDir: true }
}))
