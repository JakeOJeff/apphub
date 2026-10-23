import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'
import { api, type ListResult } from '../../lib/api'
import { listDefs, type ListKey } from '../../shared/metrics'
import { useAppState } from '../../state/AppState'
import { Button, Card, EmptyBlock } from '../../components/ui'

const MAX_COLUMNS = 10

/** A Growth list tab for a real app: rows from its mapped table, or a prompt to map one. */
export function LiveList({ k }: { k: ListKey }) {
  const { app, canEdit, mappingVersion } = useAppState()
  const navigate = useNavigate()
  const def = listDefs.find((d) => d.key === k)!
  const [page, setPage] = useState(0)
  const [data, setData] = useState<{ key: string; r: ListResult } | null>(null)
  const key = `${app.id}|${k}|${page}|${mappingVersion}`

  useEffect(() => {
    let live = true
    api.list(app.id, k, page)
      .then((r) => live && setData({ key, r }))
      .catch((e: Error) => live && setData({ key, r: { status: 'error', detail: e.message } }))
    return () => { live = false }
  }, [app.id, k, page, key])

  const r = data?.key === key ? data.r : null
  if (!r) return <div className="grid place-items-center py-16 text-subtle"><Loader2 size={18} className="animate-spin" /></div>

  if (r.status === 'off') {
    return (
      <EmptyBlock
        title={`No ${def.label.toLowerCase()} table connected`}
        body={`${app.name} doesn’t have a table detected for ${def.label.toLowerCase()}. ${def.blurb} Map one on Data & setup to list it here.`}
        action={canEdit(app.id) ? <Button variant="primary" onClick={() => navigate('/growth/setup')}>Set up</Button> : undefined}
      />
    )
  }
  if (r.status === 'error') return <EmptyBlock title={`Couldn’t load ${def.label.toLowerCase()}`} body={r.detail} action={<Button onClick={() => navigate('/growth/setup')}>Check mapping</Button>} />

  const columns = [...new Set(r.rows.flatMap((row) => Object.keys(row)))].slice(0, MAX_COLUMNS)
  const pages = r.count != null ? Math.max(1, Math.ceil(r.count / r.pageSize)) : 1

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3">
        <span className="text-[13px] font-semibold">{def.label}</span>
        <span className="font-mono text-xs text-subtle">{r.table}</span>
        {r.count != null && <span className="text-xs text-subtle">{r.count.toLocaleString()} rows</span>}
        <div className="ml-auto flex items-center gap-1">
          <Button size="icon" variant="ghost" className="h-7 w-7" disabled={page === 0} onClick={() => setPage((p) => p - 1)} aria-label="Previous page"><ChevronLeft size={14} /></Button>
          <span className="tabular text-xs text-muted">{page + 1} / {pages}</span>
          <Button size="icon" variant="ghost" className="h-7 w-7" disabled={page + 1 >= pages} onClick={() => setPage((p) => p + 1)} aria-label="Next page"><ChevronRight size={14} /></Button>
        </div>
      </div>
      {r.rows.length === 0 ? (
        <div className="px-6 py-14 text-center text-xs text-subtle">No rows yet.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-line text-left">
                {columns.map((c) => <th key={c} className="px-3 py-2 font-mono font-medium whitespace-nowrap text-subtle">{c}</th>)}
              </tr>
            </thead>
            <tbody>
              {r.rows.map((row, i) => (
                <tr key={i} className="border-b border-line last:border-0 hover:bg-hover/60">
                  {columns.map((c) => (
                    <td key={c} className="max-w-[240px] truncate px-3 py-1.5 font-mono whitespace-nowrap" title={cell(row[c])}>
                      {row[c] === null ? <span className="text-subtle">null</span> : cell(row[c])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}

/** Attribution needs per-install source data that apphub can't infer from tables yet. */
export function LiveAttribution() {
  const { app } = useAppState()
  return (
    <EmptyBlock
      title="Attribution isn’t available yet"
      body={`Splitting revenue by channel needs each install tied to the link or campaign that brought it. ${app.name}’s tables don’t record that in a way apphub can read, so nothing is shown rather than a guess.`}
    />
  )
}

function cell(v: unknown) {
  if (v === null || v === undefined) return ''
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}
