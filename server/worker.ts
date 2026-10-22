// Cloudflare Worker: /api/* runs here, everything else is the built UI (static assets, SPA fallback).
// Apps, users and access all live in apphub's Supabase; the Worker keeps only the encryption key.
import { createApi } from './app.ts'

type Bindings = {
  ASSETS: Fetcher
  /** Public vars (wrangler.jsonc). */
  SUPABASE_URL: string
  SUPABASE_PUBLISHABLE_KEY: string
  /** Secret (wrangler secret put). */
  ENCRYPTION_KEY: string
}

const api = createApi((c) => {
  const env = c.env as Bindings
  if (!env.ENCRYPTION_KEY) throw new Error('Missing Worker secret: ENCRYPTION_KEY')
  if (!env.SUPABASE_URL || !env.SUPABASE_PUBLISHABLE_KEY) throw new Error('Missing SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY vars')
  return {
    localStore: null,
    encryptionKey: env.ENCRYPTION_KEY,
    auth: { supabaseUrl: env.SUPABASE_URL, supabaseKey: env.SUPABASE_PUBLISHABLE_KEY },
    allowedHosts: null,
  }
})

export default {
  fetch(req: Request, env: Bindings, ctx: ExecutionContext) {
    const url = new URL(req.url)
    if (url.pathname.startsWith('/api/')) return api.fetch(req, env, ctx)
    return env.ASSETS.fetch(req)
  },
}
