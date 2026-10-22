import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// apphub's own sign-in (Supabase Auth). The project URL and publishable key come from the API,
// so the same build works locally and on Cloudflare. null = the server doesn't require sign-in.
let client: Promise<SupabaseClient | null> | null = null

export function authClient() {
  client ??= fetch('/api/auth/config', { headers: { 'X-Apphub': '1' } })
    .then((r) => r.json() as Promise<{ required: boolean; supabaseUrl?: string; supabaseKey?: string }>)
    .then((cfg) => (cfg.required ? createClient(cfg.supabaseUrl!, cfg.supabaseKey!, { auth: { storageKey: 'pyn.auth' } }) : null))
    .catch((e) => {
      client = null
      throw e
    })
  return client
}

export async function accessToken() {
  const sb = await authClient()
  if (!sb) return null
  return (await sb.auth.getSession()).data.session?.access_token ?? null
}

/** Supabase errors, reworded for people. */
export function authMessage(e: unknown) {
  const m = (e as Error)?.message ?? String(e)
  if (/not_invited|Database error saving new user/i.test(m)) return 'This email hasn’t been invited. Ask an owner to add you on the Team page.'
  if (/Invalid login credentials/i.test(m)) return 'Wrong email or password.'
  if (/Email not confirmed/i.test(m)) return 'Confirm your email first. Check your inbox for the link.'
  return m
}
