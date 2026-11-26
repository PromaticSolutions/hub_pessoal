import type { UploadRef } from '@shared/types'
import { api, ApiError } from './api'

export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024

/** Uploads each file straight to Storage via a signed URL; returns refs for attachments.add / companies.setLogo / backup.inspect. */
export async function uploadFiles(files: File[]): Promise<UploadRef[]> {
  if (files.some((f) => f.size > MAX_UPLOAD_BYTES)) throw new ApiError('FILE_TOO_LARGE', 'Arquivo maior que 50 MB')
  const refs: UploadRef[] = []
  for (const f of files) {
    const mime = f.type || 'application/octet-stream'
    const { key, url } = await api('files.uploadUrl', { name: f.name })
    let res: Response
    try {
      res = await fetch(url, { method: 'PUT', headers: { 'content-type': mime }, body: f })
    } catch {
      throw new ApiError('UPLOAD_FAILED', `Falha ao enviar "${f.name}". Verifique a conexão.`)
    }
    if (!res.ok) throw new ApiError('UPLOAD_FAILED', `Falha ao enviar "${f.name}" (${res.status}).`)
    refs.push({ key, name: f.name, size: f.size, mime })
  }
  return refs
}
