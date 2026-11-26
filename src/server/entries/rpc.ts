// Vercel Function /api/rpc (Node runtime, Web Request/Response). Bundled by esbuild (Task 8).
import '../tz'
import { handleRpc } from '../api/rpc'
import { createSupabaseAuth } from '../api/auth'
import { checkProdEnv, createProdContext } from '../context-prod'

let auth: ((req: Request) => Promise<{ email: string }>) | undefined

function prodAuth() {
  checkProdEnv(process.env)
  return (auth ??= createSupabaseAuth({
    url: process.env.SUPABASE_URL!,
    anonKey: process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!,
    allowedEmail: process.env.ALLOWED_EMAIL!
  }))
}

export default {
  async fetch(req: Request): Promise<Response> {
    return handleRpc(req, { ctx: () => createProdContext(), auth: (r) => prodAuth()(r) })
  }
}
