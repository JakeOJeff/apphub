// Apps in apphub's Supabase (public.apps), read and written as the signed-in user so RLS applies.
import { createClient } from '@supabase/supabase-js'
import type { CheckReport } from '../src/shared/sources.ts'
import type { Detected, Mapping } from '../src/shared/metrics.ts'
import type { AppStore, StoredApp } from './app.ts'
import type { AuthConfig } from './auth.ts'

type Row = {
  id: string
  name: string
  color: string
  platforms: string
  sources: string
  last_check: CheckReport | null
  mapping: Mapping | null
  detected: Detected | null
  created_at: string
}

const fromRow = (r: Row): StoredApp => ({
  id: r.id,
  name: r.name,
  color: r.color,
  platforms: r.platforms,
  createdAt: r.created_at,
  sources: r.sources,
  lastCheck: r.last_check ?? undefined,
  mapping: r.mapping ?? undefined,
  detected: r.detected ?? undefined,
})

const toRow = (a: StoredApp): Row => ({
  id: a.id,
  name: a.name,
  color: a.color,
  platforms: a.platforms,
  created_at: a.createdAt,
  sources: a.sources,
  last_check: a.lastCheck ?? null,
  mapping: a.mapping ?? null,
  detected: a.detected ?? null,
})

export function supabaseStore(cfg: AuthConfig, token: string): AppStore {
  const db = createClient(cfg.supabaseUrl, cfg.supabaseKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const apps = () => db.from('apps')
  const must = <T>({ data, error }: { data: T; error: { message: string } | null }) => {
    if (error) throw new Error(error.message)
    return data
  }
  return {
    list: async () => (must(await apps().select('*').order('created_at')) ?? []).map((r) => fromRow(r as Row)),
    get: async (id) => {
      const r = must(await apps().select('*').eq('id', id).maybeSingle())
      return r ? fromRow(r as Row) : undefined
    },
    put: async (app) => {
      must(await apps().upsert(toRow(app)))
    },
    delete: async (id) => {
      must(await apps().delete().eq('id', id))
    },
  }
}
