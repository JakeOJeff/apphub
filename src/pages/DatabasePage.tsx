import { useCallback, useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, Database, Loader2, RefreshCw, Search, Table2 } from 'lucide-react'
import { useAppState } from '../state/AppState'
import { getClient, testConnection } from '../lib/supabase'
import { cn } from '../lib/format'
import { Button, Card, EmptyBlock, inputCls } from '../components/ui'
import { connectionBadge } from './Apps'

const PAGE = 25

type Rows = { rows: Record<string, unknown>[]; count: number | null; error?: string }

export function DatabasePage() {
  const { app, updateApp, setAppEditor, toast } = useAppState()
  const conn = app.supabase
  const [tables, setTables] = useState<string[]>(conn?.tables ?? [])
  const [filter, setFilter] = useState('')
  const [manual, setManual] = useState('')
  const [table, setTable] = useState<string | null>(null)
  const [page, setPage] = useState(0)
  const [data, setData] = useState<Rows | null>(null)
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  // Reset when switching apps; keep the table list in sync with saved connection.
  useEffect(() => {
    setTable(null)
    setData(null)
    setPage(0)
  }, [app.id])
  useEffect(() => {
    setTables(app.supabase?.tables ?? [])
  }, [app.supabase?.tables])

  const refreshTables = async () => {
    if (!conn) return
    setRefreshing(true)
    const r = await testConnection(conn.url, conn.key)
    setRefreshing(false)
    if (!r.ok) return toast(r.error)
    setTables(r.tables)
    updateApp(app.id, { supabase: { ...conn, tables: r.tables, verifiedAt: new Date().toISOString() } })
    toast(r.schemaExposed ? `${r.tables.length} tables` : 'Schema not exposed. Open tables by name')
  }

  const load = useCallback(async () => {
    if (!conn || !table) return
    setLoading(true)
    const from = page * PAGE
    const { data: rows, count, error } = await getClient(app.id, conn)
      .from(table)
      .select('*', { count: 'exact' })
      .range(from, from + PAGE - 1)
    setLoading(false)
    setData(error ? { rows: [], count: null, error: error.message } : { rows: rows ?? [], count })
  }, [app.id, conn, table, page])

  useEffect(() => {
    load()
  }, [load])

  const open = (t: string) => {
    setTable(t)
    setPage(0)
    setData(null)
  }

  const header = (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-semibold tracking-tight">Database</h1>
          {connectionBadge(app)}
        </div>
        <p className="mt-1 text-[13px] text-muted">
          {conn ? `Browsing ${conn.url.replace(/^https:\/\//, '')} as the public role. Row Level Security applies.` : `Read ${app.name}’s Supabase tables.`}
        </p>
      </div>
      {conn && (
        <Button onClick={refreshTables} disabled={refreshing}>
          {refreshing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Refresh tables
        </Button>
      )}
    </div>
  )

  if (!conn) {
    return (
      <div>
        {header}
        <div className="mt-6">
          <EmptyBlock
            title={app.demo ? `${app.name} is a demo app` : `${app.name} isn’t connected yet`}
            body={app.demo ? 'Demo apps use generated numbers and have no database. Add your own app with its Supabase URL and key.' : 'Add the project URL and publishable key to browse its tables here.'}
            action={
              <Button variant="primary" onClick={() => setAppEditor(app.demo ? 'new' : app.id)}>
                {app.demo ? 'Add app' : 'Connect Supabase'}
              </Button>
            }
          />
        </div>
      </div>
    )
  }

  const visible = tables.filter((t) => t.toLowerCase().includes(filter.toLowerCase()))
  const columns = data?.rows.length ? Object.keys(data.rows[0]) : []
  const pages = data?.count != null ? Math.max(1, Math.ceil(data.count / PAGE)) : 1

  return (
    <div>
      {header}
      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-[240px_minmax(0,1fr)]">
        <Card className="flex flex-col overflow-hidden lg:max-h-[calc(100vh-200px)]">
          <div className="border-b border-line p-2">
            <div className="relative">
              <Search size={13} className="absolute top-1/2 left-2.5 -translate-y-1/2 text-subtle" />
              <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter tables" className={cn(inputCls, 'h-7 pl-7 text-xs')} />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-1">
            {visible.map((t) => (
              <button
                key={t}
                onClick={() => open(t)}
                className={cn('flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left font-mono text-xs', t === table ? 'bg-hover text-fg' : 'text-muted hover:bg-hover hover:text-fg')}
              >
                <Table2 size={12} className="shrink-0 text-subtle" />
                <span className="truncate">{t}</span>
              </button>
            ))}
            {tables.length === 0 && (
              <div className="px-2 py-4 text-xs text-subtle">
                No table list. Your project may not expose its schema to public keys. Open a table by name below.
              </div>
            )}
          </div>
          <form
            className="flex gap-1.5 border-t border-line p-2"
            onSubmit={(e) => {
              e.preventDefault()
              if (manual.trim()) open(manual.trim())
            }}
          >
            <input value={manual} onChange={(e) => setManual(e.target.value)} placeholder="table name" className={cn(inputCls, 'h-7 font-mono text-xs')} />
            <Button size="sm" type="submit" disabled={!manual.trim()}>Open</Button>
          </form>
        </Card>

        <Card className="min-w-0 overflow-hidden">
          {!table ? (
            <div className="flex flex-col items-center justify-center px-6 py-20 text-center">
              <Database size={20} className="text-subtle" />
              <div className="mt-2 text-sm font-semibold">Pick a table</div>
              <div className="mt-1 text-xs text-subtle">Rows load live from Supabase, {PAGE} at a time.</div>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3">
                <span className="font-mono text-[13px] font-semibold">{table}</span>
                {data?.count != null && <span className="text-xs text-subtle">{data.count.toLocaleString()} rows</span>}
                {loading && <Loader2 size={13} className="animate-spin text-subtle" />}
                <div className="ml-auto flex items-center gap-1">
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={load} aria-label="Reload"><RefreshCw size={13} /></Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7" disabled={page === 0} onClick={() => setPage((p) => p - 1)} aria-label="Previous page"><ChevronLeft size={14} /></Button>
                  <span className="tabular text-xs text-muted">{page + 1} / {pages}</span>
                  <Button size="icon" variant="ghost" className="h-7 w-7" disabled={page + 1 >= pages} onClick={() => setPage((p) => p + 1)} aria-label="Next page"><ChevronRight size={14} /></Button>
                </div>
              </div>

              {data?.error ? (
                <div className="m-4 rounded-md border border-red-500/30 bg-red-500/8 px-3 py-2 text-xs text-red-500">{data.error}</div>
              ) : data && data.rows.length === 0 ? (
                <div className="px-6 py-14 text-center text-xs text-subtle">
                  No rows returned. If the table has data, a Row Level Security policy is probably hiding it from the public key.
                </div>
              ) : (
                <div className="max-h-[calc(100vh-260px)] overflow-auto">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-card">
                      <tr className="border-b border-line text-left">
                        {columns.map((c) => <th key={c} className="px-3 py-2 font-mono font-medium whitespace-nowrap text-subtle">{c}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {data?.rows.map((r, i) => (
                        <tr key={i} className="border-b border-line last:border-0 hover:bg-hover/60">
                          {columns.map((c) => (
                            <td key={c} className="max-w-[260px] truncate px-3 py-1.5 font-mono whitespace-nowrap" title={cell(r[c])}>
                              {r[c] === null ? <span className="text-subtle">null</span> : cell(r[c])}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </Card>
      </div>
    </div>
  )
}

function cell(v: unknown) {
  if (v === null || v === undefined) return ''
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}
