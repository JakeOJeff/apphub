// apphub API. Holds each app's data sources and queries them server-side,
// the way goumi-web's admin uses its service-role client.
// Runtime-agnostic: server/node.ts (local) and server/worker.ts (Cloudflare) provide the deps.
import { Hono, type Context } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { mask, normalizeUrl, providers, requiredPassed, type CheckReport, type PublicSources, type ServerApp, type SourcesInput } from '../src/shared/sources.ts'
import { runChecks } from './checks.ts'
import { decrypt, encrypt, safeEqual, signSession, verifySession } from './crypto.ts'

export type StoredApp = {
  id: string
  name: string
  color: string
  platforms: string
  createdAt: string
  /** Encrypted JSON of SourcesInput. */
  sources: string
  lastCheck?: CheckReport
}

export type AppStore = {
  list(): Promise<StoredApp[]>
  get(id: string): Promise<StoredApp | undefined>
  put(app: StoredApp): Promise<void>
  delete(id: string): Promise<void>
}

export type Deps = {
  store: AppStore
  /** Base64 32-byte AES key. */
  encryptionKey: string
  /** When set, every API call needs a session from POST /api/auth/login. */
  auth: { password: string; sessionSecret: string } | null
  /** When set, only these Host headers are answered (local mode). */
  allowedHosts: Set<string> | null
  secureCookies: boolean
}

type Env = { Variables: { deps: Deps } }

const PAGE = 25
const SESSION_COOKIE = 'pyn_session'
const SESSION_TTL = 60 * 60 * 24 * 7

export function createApi(getDeps: (c: Context) => Deps | Promise<Deps>) {
  const api = new Hono<Env>().basePath('/api')

  api.use('*', async (c, next) => {
    const deps = await getDeps(c)
    c.set('deps', deps)
    if (deps.allowedHosts) {
      const host = (c.req.header('host') ?? '').replace(/:\d+$/, '')
      if (!deps.allowedHosts.has(host)) return c.json({ error: 'apphub API only accepts local requests' }, 403)
    }
    // A custom header forces a CORS preflight (never approved), so other sites can't call the API.
    if (c.req.header('x-apphub') !== '1') return c.json({ error: 'Missing X-Apphub header' }, 403)
    await next()
  })

  // ---------- auth ----------

  api.get('/auth/me', async (c) => {
    const { auth } = c.get('deps')
    if (!auth) return c.json({ required: false, authenticated: true })
    return c.json({ required: true, authenticated: await verifySession(auth.sessionSecret, getCookie(c, SESSION_COOKIE)) })
  })

  api.post('/auth/login', async (c) => {
    const { auth, secureCookies } = c.get('deps')
    if (!auth) return c.json({ ok: true })
    const { password } = (await c.req.json().catch(() => ({}))) as { password?: string }
    if (!password || !safeEqual(password, auth.password)) {
      await new Promise((r) => setTimeout(r, 800)) // slow down guessing
      return c.json({ error: 'Wrong password' }, 401)
    }
    setCookie(c, SESSION_COOKIE, await signSession(auth.sessionSecret, SESSION_TTL), {
      httpOnly: true,
      secure: secureCookies,
      sameSite: 'Strict',
      path: '/',
      maxAge: SESSION_TTL,
    })
    return c.json({ ok: true })
  })

  api.post('/auth/logout', (c) => {
    deleteCookie(c, SESSION_COOKIE, { path: '/' })
    return c.json({ ok: true })
  })

  api.use('*', async (c, next) => {
    const { auth } = c.get('deps')
    if (auth && !(await verifySession(auth.sessionSecret, getCookie(c, SESSION_COOKIE)))) return c.json({ error: 'Sign in required' }, 401)
    await next()
  })

  // ---------- helpers ----------

  const open = (c: Context<Env>, a: StoredApp) => decrypt(c.get('deps').encryptionKey, a.sources)
  const seal = (c: Context<Env>, s: SourcesInput) => encrypt(c.get('deps').encryptionKey, s)

  async function toPublic(c: Context<Env>, a: StoredApp): Promise<ServerApp> {
    const s = await open(c, a)
    const integrations: PublicSources['integrations'] = {}
    for (const p of providers) {
      const v = s.integrations?.[p.id]
      if (!v || !Object.values(v).some((x) => x?.trim())) continue
      integrations[p.id] = Object.fromEntries(p.fields.map((f) => [f.key, f.secret ? mask(v[f.key] ?? '') : (v[f.key] ?? '')]))
    }
    return {
      id: a.id,
      name: a.name,
      color: a.color,
      platforms: a.platforms,
      createdAt: a.createdAt,
      lastCheck: a.lastCheck,
      sources: { supabase: { url: s.supabase.url, anonKey: mask(s.supabase.anonKey), secretKey: mask(s.supabase.secretKey) }, integrations },
    }
  }

  // ---------- apps ----------

  api.get('/apps', async (c) => {
    const apps = await c.get('deps').store.list()
    return c.json(await Promise.all(apps.map((a) => toPublic(c, a))))
  })

  /** Check sources without saving (add flow). For an existing app pass appId to fill in saved secrets. */
  api.post('/apps/check', async (c) => {
    const body = (await c.req.json()) as { sources: SourcesInput; appId?: string }
    const saved = body.appId ? await c.get('deps').store.get(body.appId) : undefined
    const sources = saved ? merge(await open(c, saved), body.sources) : clean(body.sources)
    return c.json(await runChecks(sources))
  })

  api.post('/apps', async (c) => {
    const body = (await c.req.json()) as { name: string; color: string; platforms: string; sources: SourcesInput }
    if (!body.name?.trim()) return c.json({ error: 'Name is required' }, 400)
    const sources = clean(body.sources)
    const report = await runChecks(sources)
    if (!requiredPassed(report)) return c.json({ error: 'Supabase sources failed their checks', report }, 422)
    const app: StoredApp = {
      id: `${body.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'app'}-${crypto.randomUUID().slice(0, 6)}`,
      name: body.name.trim(),
      color: body.color,
      platforms: body.platforms,
      createdAt: new Date().toISOString(),
      sources: await seal(c, sources),
      lastCheck: report,
    }
    await c.get('deps').store.put(app)
    return c.json(await toPublic(c, app), 201)
  })

  api.patch('/apps/:id', async (c) => {
    const { store } = c.get('deps')
    const current = await store.get(c.req.param('id'))
    if (!current) return c.json({ error: 'Not found' }, 404)
    const body = (await c.req.json()) as Partial<{ name: string; color: string; platforms: string; sources: SourcesInput }>
    const next = { ...current }
    if (body.name?.trim()) next.name = body.name.trim()
    if (body.color) next.color = body.color
    if (body.platforms !== undefined) next.platforms = body.platforms
    if (body.sources) {
      const sources = merge(await open(c, next), body.sources)
      const report = await runChecks(sources)
      if (!requiredPassed(report)) return c.json({ error: 'Supabase sources failed their checks', report }, 422)
      next.sources = await seal(c, sources)
      next.lastCheck = report
    }
    await store.put(next)
    return c.json(await toPublic(c, next))
  })

  api.delete('/apps/:id', async (c) => {
    await c.get('deps').store.delete(c.req.param('id'))
    return c.body(null, 204)
  })

  /** Re-run checks with the saved sources. */
  api.post('/apps/:id/check', async (c) => {
    const { store } = c.get('deps')
    const a = await store.get(c.req.param('id'))
    if (!a) return c.json({ error: 'Not found' }, 404)
    a.lastCheck = await runChecks(await open(c, a))
    await store.put(a)
    return c.json(await toPublic(c, a))
  })

  // ---------- data (service role, like goumi-web's createAdminClient) ----------

  api.get('/apps/:id/tables/:table', async (c) => {
    const a = await c.get('deps').store.get(c.req.param('id'))
    if (!a) return c.json({ error: 'Not found' }, 404)
    const table = c.req.param('table')
    if (!/^[A-Za-z0-9_]+$/.test(table)) return c.json({ error: 'Invalid table name' }, 400)
    const page = Math.max(0, Number(c.req.query('page') ?? 0) || 0)
    const client = adminClient(a.id, await open(c, a))
    const { data, count, error } = await client
      .from(table)
      .select('*', { count: 'exact' })
      .range(page * PAGE, page * PAGE + PAGE - 1)
    if (error) return c.json({ error: error.message }, 400)
    return c.json({ rows: data ?? [], count, pageSize: PAGE })
  })

  api.get('/apps/:id/auth-users', async (c) => {
    const a = await c.get('deps').store.get(c.req.param('id'))
    if (!a) return c.json({ error: 'Not found' }, 404)
    const page = Math.max(0, Number(c.req.query('page') ?? 0) || 0)
    const { data, error } = await adminClient(a.id, await open(c, a)).auth.admin.listUsers({ page: page + 1, perPage: PAGE })
    if (error) return c.json({ error: error.message }, 400)
    const rows = data.users.map((u) => ({
      id: u.id,
      email: u.email ?? null,
      provider: u.app_metadata?.provider ?? null,
      role: u.app_metadata?.role ?? null,
      created_at: u.created_at,
      last_sign_in_at: u.last_sign_in_at ?? null,
    }))
    return c.json({ rows, count: (data as { total?: number }).total || (a.lastCheck?.authUsers ?? null), pageSize: PAGE })
  })

  return api
}

// ---------- source helpers ----------

function clean(input: SourcesInput): SourcesInput {
  const integrations: SourcesInput['integrations'] = {}
  for (const p of providers) {
    const v = input.integrations?.[p.id]
    if (!v) continue
    const entry = Object.fromEntries(p.fields.map((f) => [f.key, (v[f.key] ?? '').trim()]))
    if (Object.values(entry).some(Boolean)) integrations[p.id] = entry
  }
  return {
    supabase: { url: normalizeUrl(input.supabase?.url ?? ''), anonKey: (input.supabase?.anonKey ?? '').trim(), secretKey: (input.supabase?.secretKey ?? '').trim() },
    integrations,
  }
}

/** Blank fields in `patch` keep the saved value (the browser never sees saved secrets). */
function merge(saved: SourcesInput, patch: SourcesInput): SourcesInput {
  const integrations: SourcesInput['integrations'] = { ...saved.integrations }
  for (const p of providers) {
    const v = patch.integrations?.[p.id]
    if (v === undefined) continue
    if (v === null) {
      delete integrations[p.id]
      continue
    }
    const prev = saved.integrations?.[p.id] ?? {}
    integrations[p.id] = Object.fromEntries(p.fields.map((f) => [f.key, v[f.key]?.trim() ? v[f.key].trim() : f.secret ? (prev[f.key] ?? '') : (v[f.key] ?? '').trim()]))
  }
  return clean({
    supabase: {
      url: patch.supabase?.url?.trim() || saved.supabase.url,
      anonKey: patch.supabase?.anonKey?.trim() || saved.supabase.anonKey,
      secretKey: patch.supabase?.secretKey?.trim() || saved.supabase.secretKey,
    },
    integrations,
  })
}

const clients = new Map<string, SupabaseClient>()
function adminClient(appId: string, s: SourcesInput) {
  const k = `${appId}|${s.supabase.url}|${s.supabase.secretKey}`
  let c = clients.get(k)
  if (!c) {
    c = createClient(s.supabase.url, s.supabase.secretKey, { auth: { autoRefreshToken: false, persistSession: false } })
    clients.set(k, c)
  }
  return c
}
