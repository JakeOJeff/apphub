// Cloudflare Worker: /api/* runs here, everything else is the built UI (static assets, SPA fallback).
import { createApi, type AppStore, type StoredApp } from './app.ts'

type Bindings = {
  DB: D1Database
  ASSETS: Fetcher
  /** Secrets (wrangler secret put). */
  ENCRYPTION_KEY: string
  ADMIN_PASSWORD: string
  SESSION_SECRET: string
}

function d1Store(db: D1Database): AppStore {
  const parse = (row: { data: string } | null) => (row ? (JSON.parse(row.data) as StoredApp) : undefined)
  return {
    list: async () => (await db.prepare('SELECT data FROM apps ORDER BY created_at').all<{ data: string }>()).results.map((r) => JSON.parse(r.data)),
    get: async (id) => parse(await db.prepare('SELECT data FROM apps WHERE id = ?').bind(id).first<{ data: string }>()),
    put: async (app) => {
      await db
        .prepare('INSERT INTO apps (id, data, created_at) VALUES (?1, ?2, ?3) ON CONFLICT(id) DO UPDATE SET data = excluded.data')
        .bind(app.id, JSON.stringify(app), app.createdAt)
        .run()
    },
    delete: async (id) => {
      await db.prepare('DELETE FROM apps WHERE id = ?').bind(id).run()
    },
  }
}

const api = createApi((c) => {
  const env = c.env as Bindings
  if (!env.ENCRYPTION_KEY || !env.ADMIN_PASSWORD || !env.SESSION_SECRET) throw new Error('Missing Worker secrets: ENCRYPTION_KEY, ADMIN_PASSWORD, SESSION_SECRET')
  return {
    store: d1Store(env.DB),
    encryptionKey: env.ENCRYPTION_KEY,
    auth: { password: env.ADMIN_PASSWORD, sessionSecret: env.SESSION_SECRET },
    allowedHosts: null,
    secureCookies: true,
  }
})

export default {
  fetch(req: Request, env: Bindings, ctx: ExecutionContext) {
    const url = new URL(req.url)
    if (url.pathname.startsWith('/api/')) return api.fetch(req, env, ctx)
    return env.ASSETS.fetch(req)
  },
}
