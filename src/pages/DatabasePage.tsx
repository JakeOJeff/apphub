import { useCallback, useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, Database, KeyRound, Loader2, RefreshCw, Search, Table2 } from 'lucide-react'
import { useAppState } from '../state/AppState'
import { api, type Rows } from '../lib/api'
import { cn } from '../lib/format'
import { Button, Card, EmptyBlock, inputCls } from '../components/ui'
import { connectionBadge } from './Apps'

/** Pseudo-table for Supabase Auth users (auth.admin.listUsers), like goumi-web's Users page. */
const AUTH_USERS = '__auth_users__'

export function DatabasePage() {
  const { app, setAppEditor, recheckApp, toast } = useAppState()
  const server = app.server
  const tables = server?.lastCheck?.tables ?? []
  const [filter, setFilter] = useState('')
  const [manual, setManual] = useState('')
  const [table, setTable] = useState<string | null>(null)
  const [page, setPage] = useState(0)
  const [data, setData] = useState<(Rows & { error?: string }) | null>(null)
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    setTable(null)
    setData(null)
    setPage(0)
  }, [app.id])

  const refreshTables = async () => {
    setRefreshing(true)
    try {
      const a = await recheckApp(app.id)
      toast(`${a.server?.lastCheck?.tables.length ?? 0} tables`)
    } catch (e) {
      toast((e as Error).message)
    } finally {
      setRefreshing(false)
    }
  }

  const load = useCallback(async () => {
    if (!server || !table) return
    setLoading(true)
    try {
      setData(table === AUTH_USERS ? await api.authUsers(server.id, page) : await api.tableRows(server.id, table, page))
    } catch (e) {
      setData({ rows: [], count: null, pageSize: 25, error: (e as Error).message })
    } finally {
      setLoading(false)
    }
  }, [server, table, page])

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
          {server ? `${server.sources.supabase.url.replace(/^https?:\/\//, '')} · read on the apphub server with the secret key (RLS bypassed).` : `Read ${app.name}’s Supabase tables.`}
        </p>
      </div>
      {server && (
        <Button onClick={refreshTables} disabled={refreshing}>
          {refreshing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Refresh tables
        </Button>
      )}
    </div>
  )

  if (!server) {
    return (
      <div>
        {header}
        <div className="mt-6">
          <EmptyBlock
            title={`${app.name} is a demo app`}
            body="Demo apps use generated numbers and have no database. Add your own app with its Supabase sources to browse real data."
            action={<Button variant="primary" onClick={() => setAppEditor('new')}>Add app</Button>}
          />
        </div>
      </div>
    )
  }

  const visible = tables.filter((t) => t.toLowerCase().includes(filter.toLowerCase()))
  const columns = data?.rows.length ? Object.keys(data.rows[0]) : []
  const pageSize = data?.pageSize ?? 25
  const pages = data?.count != null ? Math.max(1, Math.ceil(data.count / pageSize)) : 1
  const title = table === AUTH_USERS ? 'auth.users' : table

  const navButton = (t: string, label: string, icon: React.ReactNode) => (
    <button
      key={t}
      onClick={() => open(t)}
      className={cn('flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left font-mono text-xs', t === table ? 'bg-hover text-fg' : 'text-muted hover:bg-hover hover:text-fg')}
    >
      {icon}
      <span className="truncate">{label}</span>
    </button>
  )

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
            {navButton(AUTH_USERS, `auth.users${server.lastCheck?.authUsers != null ? ` (${server.lastCheck.authUsers.toLocaleString()})` : ''}`, <KeyRound size={12} className="shrink-0 text-violet-400" />)}
            <div className="my-1 h-px bg-line" />
            {visible.map((t) => navButton(t, t, <Table2 size={12} className="shrink-0 text-subtle" />))}
            {tables.length === 0 && <div className="px-2 py-4 text-xs text-subtle">No tables found. Press Refresh tables, or open one by name below.</div>}
          </div>
          <form className="flex gap-1.5 border-t border-line p-2" onSubmit={(e) => { e.preventDefault(); if (manual.trim()) open(manual.trim()) }}>
            <input value={manual} onChange={(e) => setManual(e.target.value)} placeholder="table name" className={cn(inputCls, 'h-7 font-mono text-xs')} />
            <Button size="sm" type="submit" disabled={!manual.trim()}>Open</Button>
          </form>
        </Card>

        <Card className="min-w-0 overflow-hidden">
          {!table ? (
            <div className="flex flex-col items-center justify-center px-6 py-20 text-center">
              <Database size={20} className="text-subtle" />
              <div className="mt-2 text-sm font-semibold">Pick a table</div>
              <div className="mt-1 text-xs text-subtle">Rows load live from Supabase, {pageSize} at a time.</div>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3">
                <span className="font-mono text-[13px] font-semibold">{title}</span>
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
                <div className="px-6 py-14 text-center text-xs text-subtle">This table is empty.</div>
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
