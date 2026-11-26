export type { ApiMethods } from '../server/ipc/handlers'
export type Envelope = { ok: true; data: unknown } | { ok: false; error: { code: string; message: string } }
