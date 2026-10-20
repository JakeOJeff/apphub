import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Database, Loader2, Pencil, Plus, RefreshCw } from 'lucide-react'
import type { AppInfo } from '../data/mock'
import { useAppState } from '../state/AppState'
import { maskKey, testConnection } from '../lib/supabase'
import { AppIcon, Badge, Button, Card } from '../components/ui'

export function connectionBadge(app: AppInfo) {
  if (app.demo) return <Badge>Demo data</Badge>
  if (!app.supabase) return <Badge tone="amber">Not connected</Badge>
  if (!app.supabase.verifiedAt) return <Badge tone="blue">Untested</Badge>
  return <Badge tone="green">Connected</Badge>
}

function timeAgo(iso?: string) {
  if (!iso) return 'never'
  const s = (Date.now() - new Date(iso).getTime()) / 1000
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

export function AppsPage() {
  const { apps, setAppEditor, setAppId, updateApp, toast } = useAppState()
  const navigate = useNavigate()
  const [testing, setTesting] = useState<string | null>(null)

  const retest = async (app: AppInfo) => {
    if (!app.supabase) return
    setTesting(app.id)
    const r = await testConnection(app.supabase.url, app.supabase.key)
    setTesting(null)
    if (r.ok) {
      updateApp(app.id, { supabase: { ...app.supabase, verifiedAt: new Date().toISOString(), tables: r.tables } })
      toast(`${app.name}: connected${r.schemaExposed ? ` · ${r.tables.length} tables` : ''}`)
    } else {
      updateApp(app.id, { supabase: { ...app.supabase, verifiedAt: undefined } })
      toast(`${app.name}: ${r.error}`)
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Apps</h1>
          <p className="mt-1 text-[13px] text-muted">Each app connects to its own Supabase project. Pyn reads it with the project’s publishable key.</p>
        </div>
        <Button variant="primary" onClick={() => setAppEditor('new')}>
          <Plus size={14} /> Add app
        </Button>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {apps.map((a) => (
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

            <dl className="mt-4 space-y-1.5 text-xs">
              {a.supabase ? (
                <>
                  <Row k="Project" v={a.supabase.url.replace(/^https:\/\//, '')} />
                  <Row k="Key" v={maskKey(a.supabase.key)} mono />
                  <Row k="Last check" v={timeAgo(a.supabase.verifiedAt)} />
                  <Row k="Tables" v={a.supabase.tables?.length ? String(a.supabase.tables.length) : '—'} />
                </>
              ) : (
                <div className="py-2 text-subtle">{a.demo ? 'Sample app with generated numbers. No backend.' : 'Add a Supabase URL and key to read this app’s data.'}</div>
              )}
            </dl>

            <div className="mt-auto flex flex-wrap gap-2 pt-4">
              {!a.demo && (
                <Button size="sm" onClick={() => setAppEditor(a.id)}>
                  <Pencil size={12} /> {a.supabase ? 'Edit' : 'Connect'}
                </Button>
              )}
              {a.supabase && (
                <>
                  <Button size="sm" variant="ghost" onClick={() => retest(a)} disabled={testing === a.id}>
                    {testing === a.id ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />} Test
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => { setAppId(a.id); navigate('/database') }}>
                    <Database size={12} /> Database
                  </Button>
                </>
              )}
              {a.demo && (
                <Button size="sm" variant="ghost" onClick={() => setAppEditor(a.id)}>
                  <Pencil size={12} /> Edit / remove
                </Button>
              )}
            </div>
          </Card>
        ))}

        <button
          onClick={() => setAppEditor('new')}
          className="flex min-h-44 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-line text-sm text-muted hover:border-line-2 hover:text-fg"
        >
          <Plus size={18} /> Add app
        </button>
      </div>
    </div>
  )
}

function Row({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-subtle">{k}</dt>
      <dd className={mono ? 'truncate font-mono text-[11px]' : 'truncate'}>{v}</dd>
    </div>
  )
}
