// Data sources an app connects with. Shared by the browser and the API server.
// Mirrors goumi-web's admin: Supabase URL + publishable key + secret key are required,
// AI integrations are optional (used for health checks).

export type ProviderId = 'anthropic' | 'openai' | 'elevenlabs'

export type ProviderField = { key: string; label: string; secret: boolean; placeholder: string; optional?: boolean }

export const providers: { id: ProviderId; name: string; blurb: string; fields: ProviderField[] }[] = [
  {
    id: 'anthropic',
    name: 'Anthropic',
    blurb: 'Claude API. Checks the key is valid.',
    fields: [{ key: 'apiKey', label: 'API key', secret: true, placeholder: 'sk-ant-…' }],
  },
  {
    id: 'openai',
    name: 'OpenAI',
    blurb: 'Images and other OpenAI calls. Checks the key is valid.',
    fields: [{ key: 'apiKey', label: 'API key', secret: true, placeholder: 'sk-…' }],
  },
  {
    id: 'elevenlabs',
    name: 'ElevenLabs',
    blurb: 'Voice agents. Checks the key, remaining credits and each agent ID.',
    fields: [
      { key: 'apiKey', label: 'API key', secret: true, placeholder: 'sk_…' },
      { key: 'agentIds', label: 'Agent IDs', secret: false, placeholder: 'agent_…, agent_… (comma separated)', optional: true },
    ],
  },
]

/** What the browser sends when creating/updating an app. Blank secret fields on update = keep the saved value. */
export type SourcesInput = {
  supabase: { url: string; anonKey: string; secretKey: string }
  integrations: Partial<Record<ProviderId, Record<string, string>>>
}

/** What the server sends back: secrets are masked. */
export type PublicSources = {
  supabase: { url: string; anonKey: string; secretKey: string }
  integrations: Partial<Record<ProviderId, Record<string, string>>>
}

export type CheckStatus = 'ok' | 'warning' | 'error' | 'not_configured'

export type SourceCheck = {
  id: string
  name: string
  status: CheckStatus
  detail: string
  latencyMs: number | null
  /** Supabase checks must pass before an app can be saved. */
  required: boolean
}

export type CheckReport = {
  at: string
  checks: SourceCheck[]
  /** Table names found with the secret key. */
  tables: string[]
  authUsers: number | null
}

export type ServerApp = {
  id: string
  name: string
  color: string
  platforms: string
  createdAt: string
  sources: PublicSources
  lastCheck?: CheckReport
}

export const requiredPassed = (r: Pick<CheckReport, 'checks'>) => r.checks.filter((c) => c.required).every((c) => c.status === 'ok' || c.status === 'warning')

// ---------- validation (same rules on both sides) ----------

export function normalizeUrl(raw: string) {
  let url = raw.trim().replace(/\/+$/, '')
  if (url && !/^https?:\/\//.test(url)) url = `https://${url}`
  if (/^https:\/\/[a-z0-9]{20}$/.test(url)) url = `${url}.supabase.co`
  return url
}

export function checkUrl(url: string): string | null {
  if (!url) return 'Enter your project URL.'
  try {
    const u = new URL(url)
    const local = u.hostname === 'localhost' || u.hostname === '127.0.0.1'
    if (u.protocol !== 'https:' && !local) return 'Use an https:// URL.'
    if (u.pathname !== '/' && u.pathname !== '') return 'Use the base project URL, without /rest/v1 or other paths.'
    return null
  } catch {
    return 'That doesn’t look like a URL.'
  }
}

export type KeyKind = 'publishable' | 'anon' | 'secret' | 'service_role' | 'unknown'

function b64(s: string) {
  return atob(s.replace(/-/g, '+').replace(/_/g, '/'))
}

export function keyKind(key: string): KeyKind {
  const k = key.trim()
  if (k.startsWith('sb_publishable_')) return 'publishable'
  if (k.startsWith('sb_secret_')) return 'secret'
  if (k.startsWith('eyJ')) {
    try {
      const role = JSON.parse(b64(k.split('.')[1])).role
      if (role === 'anon') return 'anon'
      if (role === 'service_role') return 'service_role'
    } catch {
      /* fall through */
    }
  }
  return 'unknown'
}

export function checkAnonKey(key: string): string | null {
  if (!key.trim()) return 'Paste the publishable (anon) key.'
  const k = keyKind(key)
  if (k === 'secret' || k === 'service_role') return 'That’s the secret key. Put it in the Secret key field below.'
  if (k === 'unknown') return 'Expected sb_publishable_… or a legacy anon JWT (eyJ…).'
  return null
}

export function checkSecretKey(key: string): string | null {
  if (!key.trim()) return 'Paste the secret (service_role) key.'
  const k = keyKind(key)
  if (k === 'publishable' || k === 'anon') return 'That’s the publishable key. The secret key starts with sb_secret_ (or is the service_role JWT).'
  if (k === 'unknown') return 'Expected sb_secret_… or a legacy service_role JWT (eyJ…).'
  return null
}

export function mask(v: string) {
  if (!v) return ''
  return v.length > 14 ? `${v.slice(0, 10)}…${v.slice(-4)}` : '••••'
}
