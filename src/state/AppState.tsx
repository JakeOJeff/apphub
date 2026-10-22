import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { demoApps, type AppInfo, type RangeKey } from '../data/mock'
import { api, type AppFields } from '../lib/api'
import type { ServerApp, SourcesInput } from '../shared/sources'

type Toast = { id: number; message: string }

type State = {
  apps: AppInfo[]
  app: AppInfo
  setAppId: (id: string) => void
  auth: 'checking' | 'signed-out' | 'signed-in'
  signIn: (password: string) => Promise<void>
  signOut: () => Promise<void>
  /** null until the server answers; set if it can't be reached. */
  appsError: string | null
  appsLoaded: boolean
  createApp: (fields: AppFields & { sources: SourcesInput }) => Promise<AppInfo>
  saveApp: (id: string, patch: Partial<AppFields> & { sources?: SourcesInput }) => Promise<void>
  deleteApp: (id: string) => Promise<void>
  recheckApp: (id: string) => Promise<AppInfo>
  hideDemo: (id: string) => void
  /** null = closed, 'new' = add flow, otherwise the id of the app being edited. */
  appEditor: string | null
  setAppEditor: (v: string | null) => void
  range: RangeKey
  setRange: (r: RangeKey) => void
  theme: 'dark' | 'light'
  toggleTheme: () => void
  toasts: Toast[]
  toast: (message: string) => void
  paletteOpen: boolean
  setPaletteOpen: (v: boolean) => void
  aiOpen: boolean
  setAiOpen: (v: boolean) => void
}

const Ctx = createContext<State | null>(null)

const HIDDEN_DEMOS_KEY = 'pyn.hiddenDemos'

// Real apps (and their encrypted data sources) live on the apphub server, see server/.
// Only the demo apps and UI preferences stay in localStorage.
// Sample apps only show in local development, never on the deployed site.
const SHOW_DEMOS = import.meta.env.DEV

/** Stand-in when there are no apps yet; AppShell shows onboarding instead of pages. */
const noApp: AppInfo = { id: 'none', name: 'No apps yet', color: '#52525b', platforms: '', scale: 0, demo: true }

const fromServer = (a: ServerApp): AppInfo => ({ id: a.id, name: a.name, color: a.color, platforms: a.platforms, scale: 0.3, server: a })

function load<T extends string>(key: string, fallback: T): T {
  try {
    return (localStorage.getItem(key) as T) || fallback
  } catch {
    return fallback
  }
}

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [serverApps, setServerApps] = useState<ServerApp[]>([])
  const [appsLoaded, setAppsLoaded] = useState(false)
  const [appsError, setAppsError] = useState<string | null>(null)
  const [hiddenDemos, setHiddenDemos] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem(HIDDEN_DEMOS_KEY) ?? '[]') } catch { return [] }
  })
  const [appEditor, setAppEditor] = useState<string | null>(null)
  const [appId, setAppIdRaw] = useState<string>(() => load('pyn.app', 'goumi'))
  const [range, setRange] = useState<RangeKey>('30d')
  const [theme, setTheme] = useState<'dark' | 'light'>(() => load('pyn.theme', 'dark'))
  const [toasts, setToasts] = useState<Toast[]>([])
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [aiOpen, setAiOpen] = useState(false)

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
    try { localStorage.setItem('pyn.theme', theme) } catch { /* ignore */ }
  }, [theme])

  const setAppId = useCallback((id: string) => {
    setAppIdRaw(id)
    try { localStorage.setItem('pyn.app', id) } catch { /* ignore */ }
  }, [])

  const [auth, setAuth] = useState<State['auth']>('checking')

  const loadApps = useCallback(() => {
    api.listApps()
      .then((a) => { setServerApps(a); setAppsError(null) })
      .catch((e: Error) => setAppsError(e.message))
      .finally(() => setAppsLoaded(true))
  }, [])

  useEffect(() => {
    api.me()
      .then((m) => {
        setAuth(m.authenticated ? 'signed-in' : 'signed-out')
        if (m.authenticated) loadApps()
      })
      .catch((e: Error) => { setAuth('signed-in'); setAppsError(e.message); setAppsLoaded(true) })
    const onSignedOut = () => setAuth('signed-out')
    window.addEventListener('apphub:signed-out', onSignedOut)
    return () => window.removeEventListener('apphub:signed-out', onSignedOut)
  }, [loadApps])

  const signIn = useCallback(async (password: string) => {
    await api.login(password)
    setAuth('signed-in')
    loadApps()
  }, [loadApps])

  const signOut = useCallback(async () => {
    await api.logout()
    setServerApps([])
    setAuth('signed-out')
  }, [])

  const upsert = useCallback((a: ServerApp) => {
    setServerApps((list) => (list.some((x) => x.id === a.id) ? list.map((x) => (x.id === a.id ? a : x)) : [...list, a]))
    return fromServer(a)
  }, [])

  const createApp = useCallback(async (fields: AppFields & { sources: SourcesInput }) => upsert(await api.createApp(fields)), [upsert])
  const saveApp = useCallback(async (id: string, patch: Partial<AppFields> & { sources?: SourcesInput }) => { upsert(await api.updateApp(id, patch)) }, [upsert])
  const recheckApp = useCallback(async (id: string) => upsert(await api.recheck(id)), [upsert])
  const deleteApp = useCallback(async (id: string) => {
    await api.deleteApp(id)
    setServerApps((list) => list.filter((x) => x.id !== id))
  }, [])
  const hideDemo = useCallback((id: string) => {
    setHiddenDemos((h) => {
      const next = [...h, id]
      try { localStorage.setItem(HIDDEN_DEMOS_KEY, JSON.stringify(next)) } catch { /* ignore */ }
      return next
    })
  }, [])

  const apps = useMemo(
    () => [...(SHOW_DEMOS ? demoApps.filter((d) => !hiddenDemos.includes(d.id)) : []), ...serverApps.map(fromServer)],
    [hiddenDemos, serverApps],
  )

  const toast = useCallback((message: string) => {
    const id = Date.now() + Math.random()
    setToasts((t) => [...t, { id, message }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 2600)
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteOpen((v) => !v)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const value = useMemo<State>(
    () => ({
      apps,
      app: apps.find((a) => a.id === appId) ?? apps[0] ?? noApp,
      auth,
      signIn,
      signOut,
      setAppId,
      appsError,
      appsLoaded,
      createApp,
      saveApp,
      deleteApp,
      recheckApp,
      hideDemo,
      appEditor,
      setAppEditor,
      range,
      setRange,
      theme,
      toggleTheme: () => setTheme((t) => (t === 'dark' ? 'light' : 'dark')),
      toasts,
      toast,
      paletteOpen,
      setPaletteOpen,
      aiOpen,
      setAiOpen,
    }),
    [apps, appId, auth, signIn, signOut, setAppId, appsError, appsLoaded, createApp, saveApp, deleteApp, recheckApp, hideDemo, appEditor, range, theme, toasts, toast, paletteOpen, aiOpen],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAppState() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useAppState must be used inside AppStateProvider')
  return v
}
