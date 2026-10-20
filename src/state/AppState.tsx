import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { demoApps, type AppInfo, type RangeKey } from '../data/mock'

type Toast = { id: number; message: string }

type State = {
  apps: AppInfo[]
  app: AppInfo
  setAppId: (id: string) => void
  addApp: (app: Omit<AppInfo, 'id' | 'scale'>) => AppInfo
  updateApp: (id: string, patch: Partial<AppInfo>) => void
  removeApp: (id: string) => void
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

const APPS_KEY = 'pyn.apps'

// Credentials live in this browser's localStorage for now. Only public (anon/publishable)
// keys are accepted, so this is the same exposure as shipping them in your app.
// Move to a server-side store once there is a backend.
function loadApps(): AppInfo[] {
  try {
    const raw = localStorage.getItem(APPS_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as AppInfo[]
      if (Array.isArray(parsed)) return parsed
    }
  } catch {
    /* ignore */
  }
  return demoApps
}

function slug(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'app'
}

function load<T extends string>(key: string, fallback: T): T {
  try {
    return (localStorage.getItem(key) as T) || fallback
  } catch {
    return fallback
  }
}

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [apps, setApps] = useState<AppInfo[]>(loadApps)
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

  useEffect(() => {
    try { localStorage.setItem(APPS_KEY, JSON.stringify(apps)) } catch { /* ignore */ }
  }, [apps])

  const addApp = useCallback((input: Omit<AppInfo, 'id' | 'scale'>) => {
    const app: AppInfo = { ...input, id: `${slug(input.name)}-${Math.random().toString(36).slice(2, 6)}`, scale: 0.3 }
    setApps((a) => [...a, app])
    return app
  }, [])

  const updateApp = useCallback((id: string, patch: Partial<AppInfo>) => {
    setApps((a) => a.map((x) => (x.id === id ? { ...x, ...patch } : x)))
  }, [])

  const removeApp = useCallback((id: string) => {
    setApps((a) => a.filter((x) => x.id !== id))
  }, [])

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
      app: apps.find((a) => a.id === appId) ?? apps[0] ?? demoApps[0],
      setAppId,
      addApp,
      updateApp,
      removeApp,
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
    [apps, appId, setAppId, addApp, updateApp, removeApp, appEditor, range, theme, toasts, toast, paletteOpen, aiOpen],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAppState() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useAppState must be used inside AppStateProvider')
  return v
}
