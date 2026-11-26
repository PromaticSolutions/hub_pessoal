/**
 * File storage (Supabase Storage bucket `hub-files` in production, local disk in dev/tests).
 * Keys are `/`-separated paths relative to the bucket, e.g. `attachments/2026/11/<uuid>-nome.pdf`;
 * a key starting with `/` or with an empty, `.` or `..` segment is rejected with AppError VALIDATION.
 */
export interface Storage {
  /** Creates or overwrites the object. */
  put(key: string, data: Uint8Array, contentType?: string): Promise<void>
  /** Throws AppError NOT_FOUND when the object does not exist. */
  get(key: string): Promise<Uint8Array>
  exists(key: string): Promise<boolean>
  /** Throws AppError NOT_FOUND when `from` does not exist; overwrites `to`. */
  copy(from: string, to: string): Promise<void>
  /** Throws AppError NOT_FOUND when `from` does not exist; overwrites `to`. */
  move(from: string, to: string): Promise<void>
  /** Missing keys are ignored. */
  remove(keys: string[]): Promise<void>
  /** Every object whose key starts with `prefix` (recursive), sorted by key. `updatedAt` is ISO UTC. */
  list(prefix: string): Promise<{ key: string; size: number; updatedAt: string }[]>
  /** GET URL valid for 3600 s; `downloadName` makes the browser download with that file name. */
  signedUrl(key: string, opts?: { downloadName?: string }): Promise<string>
  /** PUT URL valid for 3600 s, used by the browser to upload the object directly. */
  signedUploadUrl(key: string): Promise<string>
}

export const SIGNED_URL_TTL_SECONDS = 3600
