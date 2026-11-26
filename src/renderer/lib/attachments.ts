import { api } from './api'
import { openAsync } from './links'
import { useCall, useRun } from './queries'
import { uploadFiles } from './upload'

/** Signed Storage URLs live 3600 s; reuse them for 30 min instead of re-signing on every focus. */
export const SIGNED_URL_STALE_MS = 30 * 60 * 1000

type Target = { taskId: number } | { projectId: number } | { ideaId: number }

export function useAttachmentActions() {
  const call = useCall()
  const run = useRun()
  return {
    /** Uploads the files straight to Storage, then links them to the task/project/idea. */
    add: (target: Target, files: File[]) => {
      if (!files.length) return
      run(async () => {
        const uploads = await uploadFiles(files)
        await call('attachments.add', { ...target, uploads })
      })
    },
    /** Opens the file (signed URL) in a new browser tab. */
    open: (id: number) => run(() => openAsync(() => api('attachments.url', { id })))
  }
}
