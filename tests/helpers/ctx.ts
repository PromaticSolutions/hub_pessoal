import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { UploadRef } from '@shared/types'
import type { AppContext } from '@server/context'
import type { Storage } from '@server/storage/storage'
import { newUploadKey } from '@server/services/attachments'
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

/** Simulates a browser upload: puts the content at a fresh uploads/tmp/ key and returns its UploadRef. */
export async function tempUpload(storage: Storage, name: string, content: string | Uint8Array, mime = ''): Promise<UploadRef> {
  const key = newUploadKey(name)
  const data = typeof content === 'string' ? new TextEncoder().encode(content) : content
  await storage.put(key, data)
  return { key, name, size: data.length, mime }
}
