import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Database, EyeOff, Loader2, Pencil, Plus, RefreshCw, ServerCrash } from 'lucide-react'
import type { AppInfo } from '../data/mock'
import { useAppState } from '../state/AppState'
import { providers, requiredPassed } from '../shared/sources'
import { AppIcon, Badge, Button, Card } from '../components/ui'
import { CheckList } from '../components/CheckList'

export function connectionBadge(app: AppInfo) {
  if (app.demo) return <Badge>Demo data</Badge>
  const r = app.server?.lastCheck
  if (!r) return <Badge tone="blue">Not checked</Badge>
  if (!requiredPassed(r)) return <Badge tone="red">Sources failing</Badge>
  if (r.checks.some((c) => c.status === 'error' || c.status === 'warning')) return <Badge tone="amber">Needs attention</Badge>
  return <Badge tone="green">Connected</Badge>
}

export function timeAgo(iso?: string) {
  if (!iso) return 'never'
  const s = (Date.now() - new Date(iso).getTime()) / 1000
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

export function AppsPage() {
  const { apps, appsError, appsLoaded, setAppEditor, setAppId, recheckApp, hideDemo, toast, isOwner, canEdit } = useAppState()
  const navigate = useNavigate()
  const [checking, setChecking] = useState<string | null>(null)

  const recheck = async (a: AppInfo) => {
    setChecking(a.id)
    try {
      const next = await recheckApp(a.id)
      toast(next.server?.lastCheck && requiredPassed(next.server.lastCheck) ? `${a.name}: sources OK` : `${a.name}: some sources failed`)
    } catch (e) {
      toast((e as Error).message)
    } finally {
      setChecking(null)
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Apps</h1>
          <p className="mt-1 text-[13px] text-muted">Each app brings its own data sources. Secrets stay encrypted on the apphub server.</p>
        </div>
        {isOwner && (
          <Button variant="primary" onClick={() => setAppEditor('new')} disabled={!!appsError}>
            <Plus size={14} /> Add app
          </Button>
        )}
      </div>

      {appsError && (
        <div className="mt-4 flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/8 px-3 py-2 text-xs text-red-500">
          <ServerCrash size={14} /> {appsError}
        </div>
      )}

      <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {apps.map((a) => {
          const s = a.server
          const integrations = s ? providers.filter((p) => s.sources.integrations[p.id]).map((p) => p.name) : []
          return (
            <Card key={a.id} className="flex flex-col p-4">
              <div className="flex items-start gap-3">
                <AppIcon app={a} size={36} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-[14px] font-semibold">{a.name}</span>
                    {connectionBadge(a)}
                  </div>
                  <div className="text-xs text-subtle">{a.platforms || 'No platforms set'}</div>
                </div>
              </div>

              {s ? (
                <>
                  <dl className="mt-4 space-y-1.5 text-xs">
                    <Row k="Supabase" v={s.sources.supabase.url.replace(/^https?:\/\//, '')} />
                    <Row k="Publishable key" v={s.sources.supabase.anonKey} mono />
                    <Row k="Secret key" v={s.sources.supabase.secretKey} mono />
                    <Row k="Integrations" v={integrations.join(', ') || 'None'} />
                    <Row k="Last check" v={timeAgo(s.lastCheck?.at)} />
                  </dl>
                  {s.lastCheck && (
                    <div className="mt-3 border-t border-line pt-3">
                      <CheckList report={s.lastCheck} hideUnconfigured />
                    </div>
                  )}
                </>
              ) : (
                <div className="mt-4 py-2 text-xs text-subtle">Sample app with generated numbers. No data sources.</div>
              )}

              <div className="mt-auto flex flex-wrap gap-2 pt-4">
                {s ? (
                  <>
                    {canEdit(a.id) && (
                      <>
                        <Button size="sm" onClick={() => setAppEditor(a.id)}><Pencil size={12} /> Edit sources</Button>
                        <Button size="sm" variant="ghost" onClick={() => recheck(a)} disabled={checking === a.id}>
                          {checking === a.id ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />} Re-check
                        </Button>
                      </>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => { setAppId(a.id); navigate('/database') }}><Database size={12} /> Database</Button>
                  </>
                ) : (
                  <Button size="sm" variant="ghost" onClick={() => { hideDemo(a.id); toast(`${a.name} hidden`) }}><EyeOff size={12} /> Hide sample</Button>
                )}
              </div>
            </Card>
          )
        })}

        {appsLoaded && !appsError && isOwner && (
          <button onClick={() => setAppEditor('new')} className="flex min-h-44 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-line text-sm text-muted hover:border-line-2 hover:text-fg">
            <Plus size={18} /> Add app
          </button>
        )}
      </div>
    </div>
  )
}

function Row({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="shrink-0 text-subtle">{k}</dt>
      <dd className={mono ? 'truncate font-mono text-[11px]' : 'truncate'}>{v}</dd>
    </div>
  )
}
