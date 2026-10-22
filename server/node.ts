// Local runtime: encryption key from APPHUB_ENCRYPTION_KEY or .data/master.key. The API only answers localhost.
// With APPHUB_SUPABASE_URL + APPHUB_SUPABASE_PUBLISHABLE_KEY set (.env.local), sign-in is on and apps live in Supabase
// like production. Otherwise there's no login, you have owner access, and apps are kept in .data/apps.json.
import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createApi, type AppStore, type Deps, type StoredApp } from './app.ts'

const DIR = join(process.cwd(), '.data')
const FILE = join(DIR, 'apps.json')
const KEY_FILE = join(DIR, 'master.key')

function ensureDir() {
  if (!existsSync(DIR)) mkdirSync(DIR, { recursive: true, mode: 0o700 })
}

function readAll(): StoredApp[] {
  try {
    return JSON.parse(readFileSync(FILE, 'utf8')) as StoredApp[]
  } catch {
    return []
  }
}

function writeAll(apps: StoredApp[]) {
  ensureDir()
  writeFileSync(`${FILE}.tmp`, JSON.stringify(apps, null, 2), { mode: 0o600 })
  renameSync(`${FILE}.tmp`, FILE)
}

const store: AppStore = {
  list: async () => readAll(),
  get: async (id) => readAll().find((a) => a.id === id),
  put: async (app) => {
    const all = readAll()
    const i = all.findIndex((a) => a.id === app.id)
    if (i >= 0) all[i] = app
    else all.push(app)
    writeAll(all)
  },
  delete: async (id) => writeAll(readAll().filter((a) => a.id !== id)),
}

function encryptionKey() {
  const fromEnv = process.env.APPHUB_ENCRYPTION_KEY?.trim()
  if (fromEnv) return fromEnv
  ensureDir()
  if (!existsSync(KEY_FILE)) {
    writeFileSync(KEY_FILE, randomBytes(32).toString('base64'), { mode: 0o600 })
    console.warn('[apphub] Generated .data/master.key. Set APPHUB_ENCRYPTION_KEY in .env.local to manage it yourself.')
  }
  return readFileSync(KEY_FILE, 'utf8').trim()
}

let deps: Deps | null = null
export const api = createApi(() => {
  const auth =
    process.env.APPHUB_SUPABASE_URL && process.env.APPHUB_SUPABASE_PUBLISHABLE_KEY
      ? { supabaseUrl: process.env.APPHUB_SUPABASE_URL, supabaseKey: process.env.APPHUB_SUPABASE_PUBLISHABLE_KEY }
      : null
  deps ??= {
    localStore: auth ? null : store,
    encryptionKey: encryptionKey(),
    auth,
    allowedHosts: new Set(['localhost', '127.0.0.1', '[::1]']),
  }
  return deps
})
