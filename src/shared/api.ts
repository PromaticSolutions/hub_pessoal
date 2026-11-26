export type { ApiMethods } from '../server/api/handlers'
export type Envelope = { ok: true; data: unknown } | { ok: false; error: { code: string; message: string } }
