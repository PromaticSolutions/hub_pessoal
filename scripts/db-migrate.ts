// npm run db:migrate -- [--env <arquivo>]   Applies the Postgres schema (no seed) via DATABASE_URL_SESSION.
process.env.TZ = process.env.APP_TZ ?? 'America/Sao_Paulo'

import { parseArgs } from 'node:util'
import { closePgDb, createPgDb } from '../src/server/db/pg'
import { runMigrations } from '../src/server/db/migrate'
import { loadEnv, requireEnv, safeMessage } from './lib/env'

async function main() {
  const { values } = parseArgs({ options: { env: { type: 'string', default: './.env.local' } } })
  loadEnv(values.env)
  const db = createPgDb(requireEnv('DATABASE_URL_SESSION'))
  try {
    const r = await runMigrations(db, { seed: false })
    console.log(r.from === r.to ? `Esquema já está na versão ${r.to}.` : `Esquema migrado: versão ${r.from} → ${r.to}.`)
  } finally {
    await closePgDb(db)
  }
}

main().catch((e) => {
  console.error(`Erro: ${safeMessage(e)}`)
  process.exit(1)
})
