import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { AppContext } from '@server/context'
import { createLocalStorage } from '@server/storage/local'
import { createTestDb } from './db'

/** Fresh migrated + seeded database and a local Storage in a temporary folder. */
export async function createTestCtx(now: Date = new Date(2026, 10, 25, 12, 0)): Promise<{
  ctx: AppContext
  setNow(d: Date): void
  cleanup(): Promise<void>
}> {
  const t = await createTestDb()
  const filesRoot = mkdtempSync(join(tmpdir(), 'pth-files-'))
  let current = now
  const ctx: AppContext = { db: t.db, storage: createLocalStorage(filesRoot), now: () => current }
  return {
    ctx,
    setNow(d: Date) { current = d },
    async cleanup() {
      await t.cleanup()
      rmSync(filesRoot, { recursive: true, force: true })
    }
  }
}

export function tempFile(name: string, content: string | Buffer): string {
  const dir = mkdtempSync(join(tmpdir(), 'pth-src-'))
  const p = join(dir, name)
  writeFileSync(p, content)
  return p
}
