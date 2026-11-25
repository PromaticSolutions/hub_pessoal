export type { ApiMethods } from '../main/ipc/handlers'
export type Envelope = { ok: true; data: unknown } | { ok: false; error: { code: string; message: string } }
