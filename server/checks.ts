// Probes each data source. Same idea as goumi-web's src/lib/admin/integrations.ts:
// cheap authenticated GETs, no generation calls.
import { checkAnonKey, checkSecretKey, checkUrl, normalizeUrl, type CheckReport, type SourceCheck, type SourcesInput } from '../src/shared/sources.ts'

const TIMEOUT_MS = 12000

async function timed(url: string, init: RequestInit = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  const start = Date.now()
  try {
    const res = await fetch(url, { ...init, signal: controller.signal })
    return { res, ms: Date.now() - start, error: null as string | null }
  } catch (e) {
    const aborted = (e as Error).name === 'AbortError'
    return { res: null, ms: Date.now() - start, error: aborted ? 'Timed out' : 'Couldn’t reach it' }
  } finally {
    clearTimeout(timer)
  }
}

const check = (id: string, name: string, required: boolean, status: SourceCheck['status'], detail: string, latencyMs: number | null = null): SourceCheck => ({ id, name, required, status, detail, latencyMs })

export async function runChecks(input: SourcesInput): Promise<CheckReport> {
  const url = normalizeUrl(input.supabase.url)
  const { anonKey, secretKey } = input.supabase
  const checks: SourceCheck[] = []
  let tables: string[] = []
  let authUsers: number | null = null

  // ---- Supabase (required) ----
  const urlErr = checkUrl(url)
  if (urlErr) {
    checks.push(check('supabase_url', 'Supabase project', true, 'error', urlErr))
  } else {
    // Publishable key: auth settings is readable with any valid key.
    const anonErr = checkAnonKey(anonKey)
    if (anonErr) checks.push(check('supabase_anon', 'Publishable key', true, 'error', anonErr))
    else {
      const r = await timed(`${url}/auth/v1/settings`, { headers: { apikey: anonKey } })
      if (!r.res) checks.push(check('supabase_anon', 'Publishable key', true, 'error', `${r.error}. Check the URL and that the project isn’t paused.`, r.ms))
      else if (r.res.ok) checks.push(check('supabase_anon', 'Publishable key', true, 'ok', 'Valid for this project', r.ms))
      else checks.push(check('supabase_anon', 'Publishable key', true, 'error', r.res.status === 401 ? 'Rejected. Make sure it belongs to this project.' : `Unexpected response (${r.res.status})`, r.ms))
    }

    // Secret key: admin users endpoint only answers to service-role access.
    const secretErr = checkSecretKey(secretKey)
    if (secretErr) checks.push(check('supabase_secret', 'Secret key', true, 'error', secretErr))
    else {
      const h = { apikey: secretKey, Authorization: `Bearer ${secretKey}` }
      const r = await timed(`${url}/auth/v1/admin/users?page=1&per_page=1`, { headers: h })
      if (!r.res) checks.push(check('supabase_secret', 'Secret key', true, 'error', r.error ?? 'Failed', r.ms))
      else if (!r.res.ok) checks.push(check('supabase_secret', 'Secret key', true, 'error', r.res.status === 401 || r.res.status === 403 ? 'Rejected. Make sure it’s this project’s secret key.' : `Unexpected response (${r.res.status})`, r.ms))
      else {
        const total = Number(r.res.headers.get('x-total-count'))
        authUsers = Number.isFinite(total) ? total : null
        // Tables via the REST schema (always exposed to the service role).
        const s = await timed(`${url}/rest/v1/`, { headers: { ...h, Accept: 'application/openapi+json' } })
        if (s.res?.ok) {
          const spec = (await s.res.json()) as { definitions?: Record<string, unknown> }
          tables = Object.keys(spec.definitions ?? {}).sort()
        }
        const bits = [authUsers !== null ? `${authUsers.toLocaleString('en-US')} auth users` : null, `${tables.length} tables`].filter(Boolean)
        checks.push(check('supabase_secret', 'Secret key', true, tables.length ? 'ok' : 'warning', `Admin access confirmed · ${bits.join(' · ')}`, r.ms))
      }
    }
  }

  // ---- Integrations (optional) ----
  const ig = input.integrations ?? {}

  const anthropic = ig.anthropic?.apiKey?.trim()
  if (!anthropic) checks.push(check('anthropic', 'Anthropic', false, 'not_configured', 'Not configured'))
  else {
    const r = await timed('https://api.anthropic.com/v1/models', { headers: { 'x-api-key': anthropic, 'anthropic-version': '2023-06-01' } })
    checks.push(httpCheck('anthropic', 'Anthropic', r, 'API key valid'))
  }

  const openai = ig.openai?.apiKey?.trim()
  if (!openai) checks.push(check('openai', 'OpenAI', false, 'not_configured', 'Not configured'))
  else {
    const r = await timed('https://api.openai.com/v1/models', { headers: { Authorization: `Bearer ${openai}` } })
    checks.push(httpCheck('openai', 'OpenAI', r, 'API key valid'))
  }

  const eleven = ig.elevenlabs?.apiKey?.trim()
  if (!eleven) checks.push(check('elevenlabs', 'ElevenLabs', false, 'not_configured', 'Not configured'))
  else {
    const h = { 'xi-api-key': eleven }
    const r = await timed('https://api.elevenlabs.io/v1/user/subscription', { headers: h })
    if (r.res?.ok) {
      const sub = (await r.res.json()) as { character_count?: number; character_limit?: number }
      const left = (sub.character_limit ?? 0) - (sub.character_count ?? 0)
      const ratio = sub.character_limit ? left / sub.character_limit : 1
      checks.push(check('elevenlabs', 'ElevenLabs', false, left <= 0 ? 'error' : ratio < 0.1 ? 'warning' : 'ok', left <= 0 ? 'Credits exhausted' : `${left.toLocaleString('en-US')} characters left${ratio < 0.1 ? ' (low)' : ''}`, r.ms))
    } else checks.push(httpCheck('elevenlabs', 'ElevenLabs', r, 'API key valid'))

    const ids = (ig.elevenlabs?.agentIds ?? '').split(',').map((s) => s.trim()).filter(Boolean)
    for (const id of ids) {
      const a = await timed(`https://api.elevenlabs.io/v1/convai/agents/${encodeURIComponent(id)}`, { headers: h })
      checks.push(httpCheck(`elevenlabs_agent_${id}`, `ElevenLabs agent ${id.slice(0, 14)}`, a, 'Agent found', 'Agent not found'))
    }
  }

  return { at: new Date().toISOString(), checks, tables, authUsers }
}

function httpCheck(id: string, name: string, r: Awaited<ReturnType<typeof timed>>, okDetail: string, notFound = 'Not found'): SourceCheck {
  if (!r.res) return check(id, name, false, 'error', r.error ?? 'Failed', r.ms)
  if (r.res.ok) return check(id, name, false, 'ok', okDetail, r.ms)
  if (r.res.status === 401 || r.res.status === 403) return check(id, name, false, 'error', 'Key rejected', r.ms)
  if (r.res.status === 402 || r.res.status === 429) return check(id, name, false, 'warning', 'Out of credits or rate limited', r.ms)
  if (r.res.status === 404) return check(id, name, false, 'error', notFound, r.ms)
  return check(id, name, false, 'error', `Unexpected response (${r.res.status})`, r.ms)
}
