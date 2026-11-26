// npm run import:sqlite -- [--db <hub.db>] [--files <pasta de dados>] [--replace] [--env <arquivo>]
// Imports the desktop app's data into Supabase (DATABASE_URL_SESSION + Storage bucket hub-files) and
// verifies it. Exit code 1 when any table, checksum or file differs. Never writes to the data folder.
process.env.TZ = process.env.APP_TZ ?? 'America/Sao_Paulo'

import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { closePgDb, createPgDb } from '../src/server/db/pg'
import { createSupabaseStorage, ensureSupabaseBucket, HUB_BUCKET } from '../src/server/storage/supabase'
import { loadEnv, requireEnv, safeMessage } from './lib/env'
import { formatReport, runImport } from './sqlite-legacy/import'

async function main(): Promise<number> {
  const defaultDir = join(process.env.XDG_DATA_HOME || join(homedir(), '.local', 'share'), 'personal-task-hub')
  const { values } = parseArgs({
    options: {
      db: { type: 'string' },
      files: { type: 'string', default: defaultDir },
      replace: { type: 'boolean', default: false },
      env: { type: 'string', default: './.env.local' }
    }
  })
  loadEnv(values.env)
  const filesDir = resolve(values.files!)
  const dbFile = resolve(values.db ?? join(filesDir, 'hub.db'))
  const supabaseUrl = requireEnv('SUPABASE_URL')
  const serviceKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY')
  const db = createPgDb(requireEnv('DATABASE_URL_SESSION'))
  try {
    console.log(`Origem: ${dbFile}`)
    console.log(`Arquivos: ${filesDir}`)
    console.log(`Bucket ${HUB_BUCKET}: ${await ensureSupabaseBucket(supabaseUrl, serviceKey)}`)
    const report = await runImport({
      db,
      storage: createSupabaseStorage(supabaseUrl, serviceKey),
      dbFile,
      filesDir,
      replace: values.replace!,
      log: (m) => console.log(m)
    })
    console.log('')
    console.log(formatReport(report))
    return report.ok ? 0 : 1
  } finally {
    await closePgDb(db)
  }
}

main().then(
  (code) => process.exit(code),
  (e) => {
    console.error(`Erro: ${safeMessage(e)}`)
    process.exit(1)
  }
)
