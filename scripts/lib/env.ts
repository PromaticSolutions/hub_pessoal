import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

/** Loads `--env <file>` (default ./.env.local) into process.env without overriding set variables. */
export function loadEnv(file = './.env.local'): string {
  const path = resolve(file)
  if (!existsSync(path)) throw new Error(`Arquivo de ambiente não encontrado: ${path}`)
  process.loadEnvFile(path)
  return path
}

/** Value of a required environment variable (the error names the variable, never its value). */
export function requireEnv(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`Variável ${name} não definida no arquivo de ambiente.`)
  return v
}

/** Error text without connection strings or keys that a driver may have echoed. */
export function safeMessage(e: unknown): string {
  let msg = e instanceof Error ? `${e.name === 'AppError' ? `${(e as { code?: string }).code}: ` : ''}${e.message}` : String(e)
  for (const name of ['DATABASE_URL', 'DATABASE_URL_SESSION', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_ANON_KEY', 'SUPABASE_DB_PASSWORD']) {
    const v = process.env[name]
    if (v && v.length > 4) msg = msg.split(v).join(`<${name}>`)
  }
  return msg.replace(/postgres(ql)?:\/\/[^\s'"]+/g, 'postgres://<redacted>')
}
