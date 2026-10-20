import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { SupabaseConnection } from '../data/mock'

// ---------- input checks ----------

export function normalizeUrl(raw: string) {
  let url = raw.trim().replace(/\/+$/, '')
  if (url && !/^https?:\/\//.test(url)) url = `https://${url}`
  // Accept a bare project ref too ("abcd1234efgh5678ijkl").
  if (/^https:\/\/[a-z0-9]{20}$/.test(url)) url = `${url}.supabase.co`
  return url
}

export function checkUrl(url: string): string | null {
  if (!url) return 'Enter your project URL.'
  try {
    const u = new URL(url)
    if (u.protocol !== 'https:' && u.hostname !== 'localhost' && u.hostname !== '127.0.0.1') return 'Use an https:// URL.'
    if (u.pathname !== '/' && u.pathname !== '') return 'Use the base project URL, without /rest/v1 or other paths.'
    return null
  } catch {
    return 'That doesn’t look like a URL.'
  }
}

export type KeyKind = 'publishable' | 'anon' | 'secret' | 'service_role' | 'unknown'

export function keyKind(key: string): KeyKind {
  const k = key.trim()
  if (k.startsWith('sb_publishable_')) return 'publishable'
  if (k.startsWith('sb_secret_')) return 'secret'
  if (k.startsWith('eyJ')) {
    try {
      const payload = JSON.parse(atob(k.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
      if (payload.role === 'anon') return 'anon'
      if (payload.role === 'service_role') return 'service_role'
    } catch {
      /* fall through */
    }
  }
  return 'unknown'
}

export function checkKey(key: string): string | null {
  if (!key.trim()) return 'Paste your project’s publishable (anon) key.'
  const kind = keyKind(key)
  if (kind === 'secret' || kind === 'service_role')
    return 'This is a secret key. It bypasses Row Level Security and must never be stored in a browser. Use the publishable / anon key instead.'
  if (kind === 'unknown') return 'Unrecognised key. Expected one starting with sb_publishable_ or a legacy anon JWT (eyJ…).'
  return null
}

// ---------- connection test ----------

export type TestResult =
  | { ok: true; tables: string[]; schemaExposed: boolean }
  | { ok: false; error: string }

const headers = (key: string) => ({ apikey: key, Authorization: `Bearer ${key}` })

export async function testConnection(url: string, key: string): Promise<TestResult> {
  // 1. Auth settings is public for any valid key: proves URL + key are right.
  let res: Response
  try {
    res = await fetch(`${url}/auth/v1/settings`, { headers: { apikey: key } })
  } catch {
    return { ok: false, error: 'Couldn’t reach that URL. Check it’s spelled right and the project isn’t paused.' }
  }
  if (res.status === 401 || res.status === 403) return { ok: false, error: 'Supabase rejected the key. Make sure it belongs to this project.' }
  if (!res.ok) return { ok: false, error: `Unexpected response from Supabase (${res.status}).` }

  // 2. Best effort: list tables from the REST schema. Some projects don't expose it to public keys.
  try {
    const r = await fetch(`${url}/rest/v1/`, { headers: { ...headers(key), Accept: 'application/openapi+json' } })
    if (r.ok) {
      const spec = await r.json()
      const tables = Object.keys(spec.definitions ?? {}).sort()
      return { ok: true, tables, schemaExposed: true }
    }
  } catch {
    /* ignore */
  }
  return { ok: true, tables: [], schemaExposed: false }
}

// ---------- clients ----------

const clients = new Map<string, SupabaseClient>()

/** One client per app; recreated if the URL or key changes. */
export function getClient(appId: string, conn: SupabaseConnection) {
  const cacheKey = `${appId}|${conn.url}|${conn.key}`
  let c = clients.get(cacheKey)
  if (!c) {
    c = createClient(conn.url, conn.key, {
      auth: { persistSession: false, autoRefreshToken: false, storageKey: `pyn-sb-${appId}` },
    })
    clients.set(cacheKey, c)
  }
  return c
}

export function maskKey(key: string) {
  return key.length > 16 ? `${key.slice(0, 12)}…${key.slice(-4)}` : '••••'
}
