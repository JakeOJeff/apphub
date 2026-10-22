// Supabase Auth on the API side. The browser signs in with supabase-js and sends its access token;
// we verify it against the project's JWKS (jose) and read the caller's roles with their own token,
// so Postgres RLS decides what they can see. No Supabase secret key is needed here.
import { createRemoteJWKSet, jwtVerify } from 'jose'

export type AuthConfig = { supabaseUrl: string; supabaseKey: string }

export type AppRole = 'editor' | 'viewer'

export type Viewer = {
  id: string
  email: string
  role: 'owner' | 'member'
  /** app id -> role. Owners can see every app regardless. */
  apps: Record<string, AppRole>
  token: string
}

/** Used when auth is off (local dev without Supabase configured). */
export const localOwner: Viewer = { id: 'local', email: 'local', role: 'owner', apps: {}, token: '' }

const jwks = new Map<string, ReturnType<typeof createRemoteJWKSet>>()
const cache = new Map<string, { viewer: Viewer | null; until: number }>()
const CACHE_MS = 30_000

export class AuthError extends Error {
  status: 401 | 403
  constructor(message: string, status: 401 | 403) {
    super(message)
    this.status = status
  }
}

export async function viewerFromToken(cfg: AuthConfig, token: string): Promise<Viewer> {
  const hit = cache.get(token)
  if (hit && hit.until > Date.now()) {
    if (!hit.viewer) throw new AuthError('No access to apphub. Ask an owner to invite you.', 403)
    return hit.viewer
  }

  let keys = jwks.get(cfg.supabaseUrl)
  if (!keys) {
    keys = createRemoteJWKSet(new URL(`${cfg.supabaseUrl}/auth/v1/.well-known/jwks.json`))
    jwks.set(cfg.supabaseUrl, keys)
  }
  let sub: string
  try {
    const { payload } = await jwtVerify(token, keys, { issuer: `${cfg.supabaseUrl}/auth/v1`, audience: 'authenticated' })
    sub = payload.sub!
  } catch {
    throw new AuthError('Session expired. Sign in again.', 401)
  }

  const access = await rpc<{ email: string; role: 'owner' | 'member'; apps: Record<string, AppRole> } | null>(cfg, token, 'my_access')
  const viewer = access ? { id: sub, email: access.email, role: access.role, apps: access.apps, token } : null
  if (cache.size > 500) cache.clear()
  cache.set(token, { viewer, until: Date.now() + CACHE_MS })
  if (!viewer) throw new AuthError('No access to apphub. Ask an owner to invite you.', 403)
  return viewer
}

/** Call a Postgres function as the signed-in user. */
export async function rpc<T>(cfg: AuthConfig, token: string, fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch(`${cfg.supabaseUrl}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: cfg.supabaseKey, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  })
  const body = await res.json().catch(() => null)
  if (!res.ok) throw new Error((body as { message?: string } | null)?.message ?? `Supabase ${fn} failed (${res.status})`)
  return body as T
}

export const canView = (v: Viewer, appId: string) => v.role === 'owner' || appId in v.apps
export const canEdit = (v: Viewer, appId: string) => v.role === 'owner' || v.apps[appId] === 'editor'
