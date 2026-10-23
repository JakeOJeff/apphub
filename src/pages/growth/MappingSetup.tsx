import { useCallback, useEffect, useMemo, useState } from 'react'
import { Check, Loader2, Plus, RefreshCw, Sparkles, X } from 'lucide-react'
import { api } from '../../lib/api'
import { liveRangeLabel, useMetric } from '../../lib/metrics'
import { cn, compact, money } from '../../lib/format'
import {
  AUTH_USERS,
  describeMap,
  isNumberType,
  isTimeType,
  listDefs,
  metricDefs,
  resolveList,
  resolveMetric,
  setupProblem,
  type Filter,
  type FilterOp,
  type ListKey,
  type ListMap,
  type Mapping,
  type MappingState,
  type MetricKey,
  type MetricMap,
  type Suggestion,
  type TableSchema,
} from '../../shared/metrics'
import { useAppState } from '../../state/AppState'
import { Badge, Button, Card, EmptyBlock, inputCls } from '../../components/ui'

const selectCls = cn(inputCls, 'pr-7')

/** Growth → Data & setup for a real app: which tables feed each metric and list. */
export function MappingSetup() {
  const { app, canEdit, mappingChanged, toast } = useAppState()
  const [state, setState] = useState<MappingState | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [detecting, setDetecting] = useState(false)
  const editable = canEdit(app.id)

  useEffect(() => {
    let live = true
    api.mapping(app.id).then((s) => live && setState(s)).catch((e: Error) => live && setError(e.message))
    return () => { live = false }
  }, [app.id])

  const save = useCallback(
    async (next: Mapping, message: string) => {
      try {
        setState(await api.saveMapping(app.id, next))
        mappingChanged(app.id)
        toast(message)
        return true
      } catch (e) {
        toast((e as Error).message)
        return false
      }
    },
    [app.id, mappingChanged, toast],
  )

  const redetect = async () => {
    setDetecting(true)
    try {
      setState(await api.detectMapping(app.id))
      mappingChanged(app.id)
      toast('Detection re-run')
    } catch (e) {
      toast((e as Error).message)
    }
    setDetecting(false)
  }

  if (error) return <EmptyBlock title="Couldn’t read this app’s schema" body={error} />
  if (!state) return <div className="grid place-items-center py-16 text-subtle"><Loader2 size={18} className="animate-spin" /></div>

  const connected = metricDefs.filter((d) => resolveMetric(d.key, state.saved, state.detected).map).length

  return (
    <div className="space-y-6">
      <Card className="flex flex-wrap items-center gap-4 p-4">
        <div className="min-w-60 flex-1">
          <div className="text-[13px] font-semibold">Where {app.name}’s numbers come from</div>
          <div className="mt-1 text-xs text-muted">
            {connected} of {metricDefs.length} metrics connected. Mappings were detected from {state.tables.length} tables
            {state.detected?.at ? ` on ${new Date(state.detected.at).toLocaleString()}` : ''}. Anything detected can be changed; anything missing can be mapped by hand.
          </div>
        </div>
        {editable && (
          <Button onClick={redetect} disabled={detecting}>
            {detecting ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Re-detect
          </Button>
        )}
      </Card>

      <div>
        <div className="mb-2 text-[13px] font-semibold">Metrics</div>
        <Card className="divide-y divide-line">
          {metricDefs.map((d) => (
            <MetricRow key={d.key} k={d.key} state={state} editable={editable} save={save} />
          ))}
        </Card>
      </div>

      <div>
        <div className="mb-2 text-[13px] font-semibold">Lists</div>
        <Card className="divide-y divide-line">
          {listDefs.map((d) => (
            <ListRow key={d.key} k={d.key} state={state} editable={editable} save={save} />
          ))}
        </Card>
      </div>
    </div>
  )
}

type RowProps<K> = { k: K; state: MappingState; editable: boolean; save: (m: Mapping, message: string) => Promise<boolean> }

function withMetric(saved: Mapping, k: MetricKey, v: MetricMap | null | undefined): Mapping {
  const metrics = { ...saved.metrics }
  if (v === undefined) delete metrics[k]
  else metrics[k] = v
  return { ...saved, metrics }
}

function withList(saved: Mapping, k: ListKey, v: ListMap | null | undefined): Mapping {
  const lists = { ...saved.lists }
  if (v === undefined) delete lists[k]
  else lists[k] = v
  return { ...saved, lists }
}

function StatusBadge({ map, source, suggestion }: { map: MetricMap | ListMap | null; source: 'saved' | 'detected'; suggestion?: Suggestion<unknown> }) {
  if (!map) return <Badge>{source === 'saved' ? 'Turned off' : 'Not found'}</Badge>
  if ('value' in map && setupProblem(map)) return <Badge tone="amber">Needs setup</Badge>
  if (source === 'saved') return <Badge tone="blue">Set by hand</Badge>
  return <Badge tone={suggestion?.confidence === 'high' ? 'green' : 'purple'}><Sparkles size={10} className="mr-1" />Detected{suggestion?.confidence === 'high' ? '' : ' · check'}</Badge>
}

function MetricRow({ k, state, editable, save }: RowProps<MetricKey>) {
  const { app, range, mappingVersion } = useAppState()
  const def = metricDefs.find((d) => d.key === k)!
  const { map, source } = resolveMetric(k, state.saved, state.detected)
  const suggestion = state.detected?.metrics[k]
  const [editing, setEditing] = useState(false)
  const preview = useMetric(app.id, k, range, mappingVersion)

  return (
    <div className="px-4 py-3">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-56 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-medium">{def.label}</span>
            <StatusBadge map={map} source={source} suggestion={suggestion} />
          </div>
          <div className="mt-0.5 font-mono text-[11px] text-muted">{map ? describeMap(map) : def.blurb}</div>
          {source === 'detected' && suggestion && <div className="mt-1 text-xs text-subtle">{suggestion.reason}</div>}
          {map && setupProblem(map) && <div className="mt-1 text-xs text-amber-500">{setupProblem(map)}</div>}
        </div>
        <div className="text-right text-xs">
          <div className="text-subtle">{liveRangeLabel(range)}</div>
          <div className="tabular font-semibold">
            {!preview ? '…' : preview.status === 'ok' ? (k === 'revenue' ? money(preview.value) : compact(preview.value)) : preview.status === 'error' ? <span className="text-red-500" title={preview.detail}>error</span> : '—'}
          </div>
        </div>
        {editable && !editing && <Button size="sm" onClick={() => setEditing(true)}>{map ? 'Edit' : 'Set up'}</Button>}
      </div>
      {editing && (
        <MetricEditor
          k={k}
          initial={map}
          tables={state.tables}
          canReset={source === 'saved'}
          onCancel={() => setEditing(false)}
          onSave={async (v, msg) => { if (await save(withMetric(state.saved, k, v), msg)) setEditing(false) }}
        />
      )}
    </div>
  )
}

function MetricEditor({ k, initial, tables, canReset, onCancel, onSave }: {
  k: MetricKey
  initial: MetricMap | null
  tables: TableSchema[]
  canReset: boolean
  onCancel: () => void
  onSave: (v: MetricMap | null | undefined, message: string) => void
}) {
  const label = metricDefs.find((d) => d.key === k)!.label
  const [draft, setDraft] = useState<MetricMap | null>(initial)
  const timed = useMemo(() => tables.filter((t) => t.columns.some((c) => isTimeType(c.type))), [tables])
  const table = draft && draft.table !== AUTH_USERS ? tables.find((t) => t.name === draft.table) : undefined
  const isAuth = draft?.table === AUTH_USERS

  const pickTable = (name: string) => {
    if (!name) return setDraft(null)
    if (name === AUTH_USERS) return setDraft({ table: AUTH_USERS, dateColumn: 'created_at', filters: [], value: { kind: 'count' } })
    const t = tables.find((x) => x.name === name)!
    const date = ['started_at', 'created_at', 'inserted_at'].find((n) => t.columns.some((c) => c.name === n && isTimeType(c.type))) ?? t.columns.find((c) => isTimeType(c.type))!.name
    setDraft({ table: name, dateColumn: date, filters: [], value: k === 'revenue' ? revenueDefault(t) : { kind: 'count' } })
  }
  const problem = draft && (!isAuth && !table ? 'Pick a table' : draft.value.kind !== 'count' && !draft.value.column ? 'Pick a column' : null)

  return (
    <div className="mt-3 space-y-3 rounded-lg border border-line bg-card-2 p-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <div className="mb-1 text-xs font-medium text-muted">Source</div>
          <select className={selectCls} value={draft?.table ?? ''} onChange={(e) => pickTable(e.target.value)}>
            <option value="">Off: don’t show {label.toLowerCase()}</option>
            <option value={AUTH_USERS}>Supabase Auth users</option>
            {timed.map((t) => <option key={t.name} value={t.name}>{t.name}</option>)}
          </select>
        </label>
        {draft && table && (
          <label className="block">
            <div className="mb-1 text-xs font-medium text-muted">Date column (when it happened)</div>
            <select className={selectCls} value={draft.dateColumn} onChange={(e) => setDraft({ ...draft, dateColumn: e.target.value })}>
              {table.columns.filter((c) => isTimeType(c.type)).map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
            </select>
          </label>
        )}
      </div>

      {draft && table && <FilterEditor table={table} filters={draft.filters} onChange={(filters) => setDraft({ ...draft, filters })} />}

      {draft && table && k === 'revenue' && <ValueEditor table={table} map={draft} onChange={setDraft} />}
      {isAuth && <div className="text-xs text-subtle">Counts every account by its created date. Auth users can’t be filtered.</div>}

      <div className="flex flex-wrap items-center gap-2 pt-1">
        {problem && <span className="text-xs text-amber-500">{problem}</span>}
        {canReset && (
          <Button size="sm" variant="ghost" onClick={() => onSave(undefined, `${label} back to the detected mapping`)}>
            <Sparkles size={12} /> Use detected
          </Button>
        )}
        <span className="ml-auto" />
        <Button size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button size="sm" variant="primary" disabled={!!problem} onClick={() => onSave(draft, draft ? `${label} mapping saved` : `${label} turned off`)}>
          <Check size={12} /> Save
        </Button>
      </div>
    </div>
  )
}

/** An amount column to sum if there is one, else a price per product-like column. */
function revenueDefault(t: TableSchema): MetricMap['value'] {
  const amount = t.columns.find((c) => isNumberType(c.type) && /amount|price|revenue|total|paid/i.test(c.name))
  if (amount) return { kind: 'sum', column: amount.name, divideBy: /cents/i.test(amount.name) ? 100 : 1 }
  const product = t.columns.find((c) => /product|plan|sku|tier/i.test(c.name)) ?? t.columns.find((c) => !isTimeType(c.type) && !/json/.test(c.type))
  return { kind: 'price', column: product?.name ?? '', prices: {} }
}

const ops: { key: FilterOp; label: string }[] = [
  { key: 'eq', label: 'is' },
  { key: 'neq', label: 'is not' },
  { key: 'in', label: 'is one of' },
  { key: 'is', label: 'is (true / false / null)' },
]

function FilterEditor({ table, filters, onChange }: { table: TableSchema; filters: Filter[]; onChange: (f: Filter[]) => void }) {
  const set = (i: number, patch: Partial<Filter>) => onChange(filters.map((f, j) => (j === i ? { ...f, ...patch } : f)))
  return (
    <div>
      <div className="mb-1 text-xs font-medium text-muted">Only rows where</div>
      <div className="space-y-2">
        {filters.map((f, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2">
            <select className={cn(selectCls, 'w-auto min-w-36 font-mono')} value={f.column} onChange={(e) => set(i, { column: e.target.value, value: '' })}>
              {table.columns.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
            </select>
            <select className={cn(selectCls, 'w-auto')} value={f.op} onChange={(e) => set(i, { op: e.target.value as FilterOp })}>
              {ops.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
            </select>
            <ValueInput table={table.name} column={f.column} value={f.value} onChange={(value) => set(i, { value })} placeholder={f.op === 'in' ? 'a, b, c' : f.op === 'is' ? 'true' : 'value'} />
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => onChange(filters.filter((_, j) => j !== i))} aria-label="Remove filter"><X size={13} /></Button>
          </div>
        ))}
        <Button size="sm" variant="ghost" onClick={() => onChange([...filters, { column: table.columns[0].name, op: 'eq', value: '' }])}>
          <Plus size={12} /> Add filter
        </Button>
      </div>
    </div>
  )
}

/** Text input that suggests the column's existing values. */
function ValueInput({ table, column, value, onChange, placeholder }: { table: string; column: string; value: string; onChange: (v: string) => void; placeholder: string }) {
  const values = useValues(table, column)
  const id = `vals-${table}-${column}`
  return (
    <>
      <input className={cn(inputCls, 'w-44 flex-1 font-mono')} list={id} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
      <datalist id={id}>{values?.map((v) => <option key={v.value} value={v.value}>{`${v.count} rows`}</option>)}</datalist>
    </>
  )
}

const valuesCache = new Map<string, Promise<{ value: string; count: number }[]>>()
function useValues(table: string, column: string) {
  const { app } = useAppState()
  const [vals, setVals] = useState<{ k: string; v: { value: string; count: number }[] } | null>(null)
  const k = `${app.id}|${table}|${column}`
  useEffect(() => {
    if (!table || !column) return
    let live = true
    if (!valuesCache.has(k)) valuesCache.set(k, api.values(app.id, table, column).catch(() => []))
    valuesCache.get(k)!.then((v) => live && setVals({ k, v }))
    return () => { live = false }
  }, [app.id, table, column, k])
  return vals?.k === k ? vals.v : null
}

function ValueEditor({ table, map, onChange }: { table: TableSchema; map: MetricMap; onChange: (m: MetricMap) => void }) {
  const v = map.value
  const numeric = table.columns.filter((c) => isNumberType(c.type))
  const text = table.columns.filter((c) => !isTimeType(c.type) && !/json/.test(c.type))
  return (
    <div>
      <div className="mb-1 text-xs font-medium text-muted">Amount</div>
      <div className="flex flex-wrap items-center gap-2">
        <select
          className={cn(selectCls, 'w-auto')}
          value={v.kind}
          onChange={(e) => {
            const kind = e.target.value
            onChange({ ...map, value: kind === 'sum' ? { kind: 'sum', column: numeric[0]?.name ?? '', divideBy: 1 } : kind === 'price' ? { kind: 'price', column: text[0]?.name ?? '', prices: {} } : { kind: 'count' } })
          }}
        >
          <option value="sum" disabled={!numeric.length}>Sum of an amount column</option>
          <option value="price">Price per value (e.g. per product)</option>
          <option value="count">Count rows (not money)</option>
        </select>
        {v.kind === 'sum' && (
          <>
            <select className={cn(selectCls, 'w-auto font-mono')} value={v.column} onChange={(e) => onChange({ ...map, value: { ...v, column: e.target.value } })}>
              {numeric.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
            </select>
            <label className="flex items-center gap-1.5 text-xs text-muted">
              <input type="checkbox" checked={v.divideBy === 100} onChange={(e) => onChange({ ...map, value: { ...v, divideBy: e.target.checked ? 100 : 1 } })} />
              Stored in cents
            </label>
          </>
        )}
        {v.kind === 'price' && (
          <select className={cn(selectCls, 'w-auto font-mono')} value={v.column} onChange={(e) => onChange({ ...map, value: { kind: 'price', column: e.target.value, prices: {} } })}>
            {text.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
          </select>
        )}
      </div>
      {v.kind === 'price' && v.column && <PriceList table={table.name} column={v.column} prices={v.prices} onChange={(prices) => onChange({ ...map, value: { ...v, prices } })} />}
    </div>
  )
}

function PriceList({ table, column, prices, onChange }: { table: string; column: string; prices: Record<string, number>; onChange: (p: Record<string, number>) => void }) {
  const values = useValues(table, column)
  const keys = [...new Set([...(values ?? []).map((v) => v.value), ...Object.keys(prices)])]
  return (
    <div className="mt-2 rounded-md border border-line bg-card p-2">
      <div className="mb-1.5 text-[11px] text-subtle">Price in USD for each {column}. Leave blank for values that aren’t paid (they count as $0).</div>
      {!values && <Loader2 size={13} className="animate-spin text-subtle" />}
      {values && keys.length === 0 && <div className="text-xs text-subtle">No values found in {table}.{column}.</div>}
      <div className="grid gap-1.5 sm:grid-cols-2">
        {keys.map((key) => (
          <label key={key} className="flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate font-mono text-xs" title={key}>{key}</span>
            <span className="text-xs text-subtle">$</span>
            <input
              className={cn(inputCls, 'h-7 w-24 text-right')}
              type="number"
              min="0"
              step="0.01"
              value={prices[key] ?? ''}
              onChange={(e) => {
                const next = { ...prices }
                if (e.target.value === '') delete next[key]
                else next[key] = Number(e.target.value)
                onChange(next)
              }}
            />
          </label>
        ))}
      </div>
    </div>
  )
}

function ListRow({ k, state, editable, save }: RowProps<ListKey>) {
  const def = listDefs.find((d) => d.key === k)!
  const { map, source } = resolveList(k, state.saved, state.detected)
  const suggestion = state.detected?.lists[k]
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<ListMap | null>(map)
  const table = draft ? state.tables.find((t) => t.name === draft.table) : undefined

  return (
    <div className="px-4 py-3">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-56 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-medium">{def.label}</span>
            <StatusBadge map={map} source={source} suggestion={suggestion} />
          </div>
          <div className="mt-0.5 font-mono text-[11px] text-muted">{map ? describeMap(map) : def.blurb}</div>
          {source === 'detected' && suggestion && !map && <div className="mt-1 text-xs text-subtle">{suggestion.reason}</div>}
        </div>
        {editable && !editing && <Button size="sm" onClick={() => { setDraft(map); setEditing(true) }}>{map ? 'Edit' : 'Set up'}</Button>}
      </div>
      {editing && (
        <div className="mt-3 space-y-3 rounded-lg border border-line bg-card-2 p-3">
          <label className="block max-w-sm">
            <div className="mb-1 text-xs font-medium text-muted">Table</div>
            <select className={selectCls} value={draft?.table ?? ''} onChange={(e) => setDraft(e.target.value ? { table: e.target.value, filters: [] } : null)}>
              <option value="">Off: no {def.label.toLowerCase()} table</option>
              {state.tables.map((t) => <option key={t.name} value={t.name}>{t.name}</option>)}
            </select>
          </label>
          {draft && table && <FilterEditor table={table} filters={draft.filters} onChange={(filters) => setDraft({ ...draft, filters })} />}
          <div className="flex flex-wrap items-center gap-2">
            {source === 'saved' && (
              <Button size="sm" variant="ghost" onClick={async () => { if (await save(withList(state.saved, k, undefined), `${def.label} back to the detected table`)) setEditing(false) }}>
                <Sparkles size={12} /> Use detected
              </Button>
            )}
            <span className="ml-auto" />
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
            <Button size="sm" variant="primary" onClick={async () => { if (await save(withList(state.saved, k, draft), draft ? `${def.label} mapping saved` : `${def.label} turned off`)) setEditing(false) }}>
              <Check size={12} /> Save
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
