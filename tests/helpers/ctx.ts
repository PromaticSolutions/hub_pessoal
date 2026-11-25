import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { AppContext } from '@main/context'
import { createTestDb } from './db'

export function createTestCtx(now: Date = new Date(2026, 10, 25, 12, 0)) {
  const t = createTestDb()
  let current = now
  const ctx: AppContext = { db: t.db, paths: t.paths, now: () => current }
  return {
    ctx,
    setNow(d: Date) { current = d },
    cleanup: t.cleanup
  }
}

export function tempFile(name: string, content: string | Buffer): string {
  const dir = mkdtempSync(join(tmpdir(), 'pth-src-'))
  const p = join(dir, name)
  writeFileSync(p, content)
  return p
}
