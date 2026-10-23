// apphub API. Holds each app's data sources and queries them server-side,
// the way goumi-web's admin uses its service-role client.
// Runtime-agnostic: server/node.ts (local) and server/worker.ts (Cloudflare) provide the deps.
import { Hono, type Context } from 'hono'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { mask, normalizeUrl, providers, requiredPassed, type CheckReport, type PublicSources, type ServerApp, type SourcesInput } from '../src/shared/sources.ts'
import { runChecks } from './checks.ts'
import { AuthError, canEdit, canView, localOwner, viewerFromToken, type AuthConfig, type Viewer } from './auth.ts'
import { decrypt, encrypt } from './crypto.ts'
import { supabaseStore } from './supabaseStore.ts'
import { AppData, filterQuery } from './appData.ts'
import { detect, validateMapping } from './mapping.ts'
import { computeMetric } from './metrics.ts'
import { describeMap, emptyMapping, ident, listDefs, metricDefs, resolveList, resolveMetric, type Detected, type ListKey, type Mapping, type MetricKey, type Range } from '../src/shared/metrics.ts'

export type StoredApp = {
  id: string
  name: string
  color: string
  platforms: string
  createdAt: string
  /** Encrypted JSON of SourcesInput. */
  sources: string
  lastCheck?: CheckReport
  /** Tables mapped to Growth metrics by hand; missing keys fall back to `detected`. */
  mapping?: Mapping
  /** What detection found at the last check. */
  detected?: Detected
}

export type AppStore = {
  list(): Promise<StoredApp[]>
  get(id: string): Promise<StoredApp | undefined>
  put(app: StoredApp): Promise<void>
  delete(id: string): Promise<void>
}

export type Deps = {
  /** Where apps live when sign-in is off (local). With sign-in on, apps live in apphub's Supabase. */
  localStore: AppStore | null
  /** Base64 32-byte AES key. */
  encryptionKey: string
  /** When set, every API call needs a Supabase Auth access token (Authorization: Bearer). Null = no login, full access. */
  auth: AuthConfig | null
  /** When set, only these Host headers are answered (local mode). */
  allowedHosts: Set<string> | null
}

type Env = { Variables: { deps: Deps; viewer: Viewer; store: AppStore } }

const PAGE = 25

export function createApi(getDeps: (c: Context) => Deps | Promise<Deps>) {
  const api = new Hono<Env>().basePath('/api')
  api.onError((e, c) => c.json({ error: e.message || 'Server error' }, 500))

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

  /** Public: what the browser needs to start Supabase Auth. */
  api.get('/auth/config', (c) => {
    const { auth } = c.get('deps')
    return c.json(auth ? { required: true, supabaseUrl: auth.supabaseUrl, supabaseKey: auth.supabaseKey } : { required: false })
  })

  api.use('*', async (c, next) => {
    const { auth } = c.get('deps')
    if (!auth) {
      if (!c.get('deps').localStore) throw new Error('No app store: set localStore when auth is off')
      c.set('viewer', localOwner)
      c.set('store', c.get('deps').localStore!)
      return next()
    }
    const token = c.req.header('authorization')?.match(/^Bearer (.+)$/)?.[1]
    if (!token) return c.json({ error: 'Sign in required' }, 401)
    try {
      c.set('viewer', await viewerFromToken(auth, token))
      c.set('store', supabaseStore(auth, token))
    } catch (e) {
      if (e instanceof AuthError) return c.json({ error: e.message }, e.status)
      throw e
    }
    await next()
  })

  api.get('/auth/me', (c) => {
    const { id, email, role, apps } = c.get('viewer')
    return c.json({ id, email, role, apps })
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

  const owner = (c: Context<Env>) => c.get('viewer').role === 'owner'
  const forbidden = (c: Context<Env>) => c.json({ error: 'You don’t have access to do that' }, 403)

  api.get('/apps', async (c) => {
    const viewer = c.get('viewer')
    const apps = (await c.get('store').list()).filter((a) => canView(viewer, a.id))
    return c.json(await Promise.all(apps.map((a) => toPublic(c, a))))
  })

  /** Check sources without saving (add flow). For an existing app pass appId to fill in saved secrets. */
  api.post('/apps/check', async (c) => {
    const body = (await c.req.json()) as { sources: SourcesInput; appId?: string }
    if (body.appId ? !canEdit(c.get('viewer'), body.appId) : !owner(c)) return forbidden(c)
    const saved = body.appId ? await c.get('store').get(body.appId) : undefined
    const sources = saved ? merge(await open(c, saved), body.sources) : clean(body.sources)
    return c.json(await runChecks(sources))
  })

  api.post('/apps', async (c) => {
    if (!owner(c)) return forbidden(c)
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
      detected: await detectFor(sources),
    }
    await c.get('store').put(app)
    return c.json(await toPublic(c, app), 201)
  })

  api.patch('/apps/:id', async (c) => {
    if (!canEdit(c.get('viewer'), c.req.param('id'))) return forbidden(c)
    const store = c.get('store')
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
      next.detected = (await detectFor(sources)) ?? next.detected
    }
    await store.put(next)
    return c.json(await toPublic(c, next))
  })

  api.delete('/apps/:id', async (c) => {
    if (!owner(c)) return forbidden(c)
    await c.get('store').delete(c.req.param('id')) // access rows and invites cascade
    return c.body(null, 204)
  })

  /** Re-run checks with the saved sources. */
  api.post('/apps/:id/check', async (c) => {
    if (!canEdit(c.get('viewer'), c.req.param('id'))) return forbidden(c)
    const store = c.get('store')
    const a = await store.get(c.req.param('id'))
    if (!a) return c.json({ error: 'Not found' }, 404)
    const sources = await open(c, a)
    a.lastCheck = await runChecks(sources)
    if (requiredPassed(a.lastCheck)) a.detected = (await detectFor(sources)) ?? a.detected
    await store.put(a)
    return c.json(await toPublic(c, a))
  })

  // ---------- data (service role, like goumi-web's createAdminClient) ----------

  api.get('/apps/:id/tables/:table', async (c) => {
    if (!canView(c.get('viewer'), c.req.param('id'))) return forbidden(c)
    const a = await c.get('store').get(c.req.param('id'))
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
    if (!canView(c.get('viewer'), c.req.param('id'))) return forbidden(c)
    const a = await c.get('store').get(c.req.param('id'))
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

  // ---------- Growth mapping: which tables feed which metrics ----------

  /** The app, if the viewer may see it, with a reader for its Supabase. */
  async function appFor(c: Context<Env>, edit = false) {
    const id = c.req.param('id')!
    if (!(edit ? canEdit : canView)(c.get('viewer'), id)) return null
    const a = await c.get('store').get(id)
    return a ? { a, db: new AppData(await open(c, a)) } : null
  }

  api.get('/apps/:id/mapping', async (c) => {
    const found = await appFor(c)
    if (!found) return c.json({ error: 'Not found' }, 404)
    const { a, db } = found
    const tables = await db.schema()
    if (!a.detected) {
      a.detected = await detect(db, tables)
      if (canEdit(c.get('viewer'), a.id)) await c.get('store').put(a)
    }
    return c.json({ tables, detected: a.detected, saved: a.mapping ?? emptyMapping() })
  })

  api.post('/apps/:id/mapping/detect', async (c) => {
    const found = await appFor(c, true)
    if (!found) return forbidden(c)
    const { a, db } = found
    const tables = await db.schema()
    a.detected = await detect(db, tables)
    await c.get('store').put(a)
    return c.json({ tables, detected: a.detected, saved: a.mapping ?? emptyMapping() })
  })

  api.put('/apps/:id/mapping', async (c) => {
    const found = await appFor(c, true)
    if (!found) return forbidden(c)
    const { a, db } = found
    const body = (await c.req.json()) as Mapping
    const mapping: Mapping = { metrics: {}, lists: {} }
    for (const d of metricDefs) if (body.metrics && d.key in body.metrics) mapping.metrics[d.key] = body.metrics[d.key] ?? null
    for (const d of listDefs) if (body.lists && d.key in body.lists) mapping.lists[d.key] = body.lists[d.key] ?? null
    const tables = await db.schema()
    const err = validateMapping(mapping, tables)
    if (err) return c.json({ error: err }, 400)
    a.mapping = mapping
    await c.get('store').put(a)
    return c.json({ tables, detected: a.detected, saved: mapping })
  })

  /** Distinct values of a column (sampled), for filter and price pickers. */
  api.get('/apps/:id/values', async (c) => {
    const found = await appFor(c)
    if (!found) return c.json({ error: 'Not found' }, 404)
    const table = c.req.query('table') ?? ''
    const column = c.req.query('column') ?? ''
    if (!ident.test(table) || !ident.test(column)) return c.json({ error: 'Invalid table or column' }, 400)
    try {
      return c.json(await found.db.values(table, column))
    } catch (e) {
      return c.json({ error: (e as Error).message }, 400)
    }
  })

  api.get('/apps/:id/metrics/:key', async (c) => {
    const found = await appFor(c)
    if (!found) return c.json({ error: 'Not found' }, 404)
    const key = c.req.param('key') as MetricKey
    if (!metricDefs.some((d) => d.key === key)) return c.json({ error: 'Unknown metric' }, 400)
    const range = (['today', '7d', '30d', '90d', 'custom'].includes(c.req.query('range') ?? '') ? c.req.query('range') : '30d') as Range
    const { map, source } = resolveMetric(key, found.a.mapping, found.a.detected)
    if (!map) return c.json({ status: 'off' })
    return c.json({ ...(await computeMetric(found.db, map, range)), source: describeMap(map), mappedBy: source })
  })

  api.get('/apps/:id/lists/:key', async (c) => {
    const found = await appFor(c)
    if (!found) return c.json({ error: 'Not found' }, 404)
    const key = c.req.param('key') as ListKey
    if (!listDefs.some((d) => d.key === key)) return c.json({ error: 'Unknown list' }, 400)
    const { map } = resolveList(key, found.a.mapping, found.a.detected)
    if (!map) return c.json({ status: 'off' })
    const page = Math.max(0, Number(c.req.query('page') ?? 0) || 0)
    try {
      const { rows, count } = await found.db.page(map.table, filterQuery(map.filters), page, PAGE)
      return c.json({ status: 'ok', table: map.table, rows, count, pageSize: PAGE })
    } catch (e) {
      return c.json({ status: 'error', detail: (e as Error).message })
    }
  })

  return api
}

async function detectFor(sources: SourcesInput) {
  try {
    const db = new AppData(sources)
    return await detect(db, await db.schema())
  } catch {
    return undefined
  }
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
