// Vercel Cron /api/cron/daily: automatic backup + purge. Requires `Authorization: Bearer ${CRON_SECRET}`.
import '../tz'
import { timingSafeEqual } from 'node:crypto'
import { createProdContext } from '../context-prod'
import { runDailyMaintenance } from '../services/maintenance'

const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } })

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const given = Buffer.from(req.headers.get('authorization') ?? '')
  const expected = Buffer.from(`Bearer ${secret}`)
  return given.length === expected.length && timingSafeEqual(given, expected)
}

export default {
  async fetch(req: Request): Promise<Response> {
    if (!authorized(req)) return reply(401, { ok: false, error: { code: 'UNAUTHORIZED', message: 'Não autorizado.' } })
    try {
      const data = await runDailyMaintenance(await createProdContext())
      return reply(200, { ok: true, data })
    } catch (e) {
      console.error(`[cron] daily: ${e instanceof Error ? `${e.message}\n${e.stack ?? ''}` : String(e)}`)
      return reply(500, { ok: false, error: { code: 'INTERNAL', message: 'Falha na manutenção diária.' } })
    }
  }
}
