import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertCircle, ChevronRight, Settings2, Unplug } from 'lucide-react'
import { change, liveRangeLabel, useMetric } from '../../lib/metrics'
import { compact, cn, money, pct } from '../../lib/format'
import { metricDefs, type MetricKey, type MetricResult } from '../../shared/metrics'
import { useAppState } from '../../state/AppState'
import { Card, CardHeader, Delta, SectionLabel } from '../../components/ui'
import { AreaChart, FunnelBars, Sparkline } from '../../components/charts'

type Ok = Extract<MetricResult, { status: 'ok' }>
const ok = (r: MetricResult | null): r is Ok => r?.status === 'ok'
const label = (k: MetricKey) => metricDefs.find((d) => d.key === k)!.label

/** Growth overview for a real app: only numbers computed from its mapped tables. */
export function LiveOverview() {
  const { app, range, mappingVersion } = useAppState()
  const m = {
    clicks: useMetric(app.id, 'clicks', range, mappingVersion),
    installs: useMetric(app.id, 'installs', range, mappingVersion),
    signups: useMetric(app.id, 'signups', range, mappingVersion),
    trials: useMetric(app.id, 'trials', range, mappingVersion),
    subscriptions: useMetric(app.id, 'subscriptions', range, mappingVersion),
    revenue: useMetric(app.id, 'revenue', range, mappingVersion),
  }
  const count = (r: Ok) => compact(r.value)

  const ratio = (a: MetricResult | null, b: MetricResult | null): MetricResult | null => {
    if (!a || !b) return null
    if (!ok(a) || !ok(b)) return { status: 'off' }
    const series = a.series.length === b.series.length ? a.series.map((v, i) => (v ? b.series[i] / v : 0)) : []
    return { status: 'ok', value: a.value ? b.value / a.value : 0, previous: a.previous ? b.previous / a.previous : 0, buckets: a.buckets, series, truncated: a.truncated || b.truncated }
  }
  const ctr = ratio(m.clicks, m.installs)
  const arps = ratio(m.subscriptions, m.revenue)

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <div>
          <SectionLabel>Acquisition</SectionLabel>
          <Card className="grid grid-cols-1 overflow-hidden sm:grid-cols-2 [&>*]:border-line sm:[&>*:nth-child(odd)]:border-r [&>*:nth-child(-n+2)]:border-b max-sm:[&>*]:border-b">
            <Tile label="Clicks" r={m.clicks} fmt={count} color="var(--color-acq)" />
            <Tile label="Installs" r={m.installs} fmt={count} color="var(--color-acq)" />
            <Tile label="Signups" r={m.signups} fmt={count} color="var(--color-acq)" />
            <Tile label="Click → install" r={ctr} fmt={(r) => pct(r.value * 100)} color="var(--color-acq)" derived="Installs ÷ clicks" pointDelta />
          </Card>
        </div>
        <div>
          <SectionLabel>Monetization</SectionLabel>
          <Card className="grid grid-cols-1 overflow-hidden sm:grid-cols-2 [&>*]:border-line sm:[&>*:nth-child(odd)]:border-r [&>*:nth-child(-n+2)]:border-b max-sm:[&>*]:border-b">
            <Tile label="Trials" r={m.trials} fmt={count} color="var(--color-mon)" />
            <Tile label="Subscriptions" r={m.subscriptions} fmt={count} color="var(--color-mon)" />
            <Tile label="Revenue" r={m.revenue} fmt={(r) => money(r.value, { compact: true })} color="var(--color-mon)" />
            <Tile label="Revenue per subscription" r={arps} fmt={(r) => money(r.value, { cents: true })} color="var(--color-mon)" derived="Revenue ÷ subscriptions" />
          </Card>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Funnel m={m} />
        <TrendCard m={m} />
      </div>

      <DataHealth m={m} />
    </div>
  )
}

function Tile({ label, r, fmt, color, derived, pointDelta }: { label: string; r: MetricResult | null; fmt: (r: Ok) => string; color: string; derived?: string; pointDelta?: boolean }) {
  const navigate = useNavigate()
  const setup = (text: string, tone: string, icon: ReactNode) => (
    <button onClick={() => navigate('/growth/setup')} className={cn('mt-2 flex cursor-pointer items-center gap-1.5 text-left text-xs hover:underline', tone)}>
      {icon}
      {text}
    </button>
  )
  let delta: ReactNode = null
  if (ok(r)) {
    const d = pointDelta ? Math.round((r.value - r.previous) * 1000) / 10 : change(r.value, r.previous)
    delta = d === null ? <span className="text-xs text-subtle">no prior data</span> : <Delta value={d} unit={pointDelta ? 'pt' : '%'} />
  }
  return (
    <div className="p-4">
      <div className="flex items-center justify-between text-xs text-muted">
        <span>{label}</span>
        {delta}
      </div>
      {!r ? (
        <>
          <div className="mt-2 h-7 w-20 animate-pulse rounded bg-hover" />
          <div className="mt-3 h-6 rounded bg-card-2" />
        </>
      ) : ok(r) ? (
        <>
          <div className="tabular mt-1 text-2xl font-semibold tracking-tight">{fmt(r)}</div>
          <Sparkline values={r.series} color={color} className="mt-2" />
          <div className="mt-1.5 truncate text-[11px] text-subtle" title={r.source ?? derived}>
            {derived ?? r.source}
            {r.truncated && ' · newest rows only'}
          </div>
        </>
      ) : (
        <>
          <div className="mt-1 text-2xl font-semibold tracking-tight text-subtle">—</div>
          {r.status === 'off' && setup(derived ? 'Needs both inputs connected' : 'Not connected · set up', 'text-subtle', <Unplug size={12} />)}
          {r.status === 'needs_setup' && setup(r.detail, 'text-amber-500', <Settings2 size={12} />)}
          {r.status === 'error' && setup(r.detail, 'text-red-500', <AlertCircle size={12} />)}
        </>
      )}
    </div>
  )
}

type Metrics = Record<MetricKey, MetricResult | null>

function Funnel({ m }: { m: Metrics }) {
  const keys: MetricKey[] = ['clicks', 'installs', 'signups', 'trials', 'subscriptions']
  const steps = keys.flatMap((k) => {
    const r = m[k]
    return ok(r) ? [{ label: label(k), value: r.value, color: k === 'trials' || k === 'subscriptions' ? 'var(--color-mon)' : 'var(--color-acq)' }] : []
  })
  const missing = keys.filter((k) => m[k] && !ok(m[k]))
  return (
    <Card className="flex flex-col">
      <CardHeader title="Conversion funnel" sub="Connected steps only" />
      <div className="px-4 pt-4">
        {steps.length >= 2 ? <FunnelBars steps={steps} /> : <div className="grid h-[170px] place-items-center text-xs text-subtle">Connect at least two steps to see the funnel.</div>}
      </div>
      <div className="mt-auto border-t border-line px-4 py-3 text-xs text-muted">
        {missing.length ? `Not connected: ${missing.map(label).join(', ')}.` : 'Every step is connected.'} Steps count events in the period; they aren’t the same people moving through.
      </div>
    </Card>
  )
}

function TrendCard({ m }: { m: Metrics }) {
  const { range } = useAppState()
  const pair: [MetricKey, MetricKey] = ok(m.clicks) ? ['clicks', 'installs'] : ['signups', 'subscriptions']
  const [a, b] = [m[pair[0]], m[pair[1]]]
  const series = [
    ok(a) && { name: label(pair[0]), color: 'var(--color-acq)', values: a.series },
    ok(b) && (!ok(a) || b.series.length === a.series.length) && { name: label(pair[1]), color: 'var(--color-mon)', values: b.series },
  ].filter(Boolean) as { name: string; color: string; values: number[] }[]
  const buckets = ok(a) ? a.buckets : ok(b) ? b.buckets : []
  const labels = buckets.map((t) => new Date(t).toLocaleString('en-US', range === 'today' ? { hour: '2-digit' } : { month: 'short', day: 'numeric' }))
  const empty = !series.length || series.every((s) => s.values.every((v) => !v))

  return (
    <Card className="flex flex-col">
      <CardHeader
        title={series.map((s) => s.name).join(' and ') || 'Trend'}
        sub={liveRangeLabel(range)}
        right={
          <div className="flex items-center gap-3 text-xs text-muted">
            {series.map((s) => <span key={s.name} className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm" style={{ background: s.color }} />{s.name}</span>)}
          </div>
        }
      />
      <div className="flex-1 px-4 pt-4 pb-2">
        {empty ? <div className="grid h-[230px] place-items-center text-xs text-subtle">{series.length ? 'Nothing recorded in this period.' : 'Nothing connected to chart yet.'}</div> : <AreaChart height={230} labels={labels} series={series} />}
      </div>
      {!empty && (
        <div className="flex justify-between px-4 pb-3 text-[11px] text-subtle">
          <span>{labels[0]}</span>
          <span>{labels[Math.floor(labels.length / 2)]}</span>
          <span>{labels[labels.length - 1]}</span>
        </div>
      )}
    </Card>
  )
}

/** What's not connected or not trustworthy yet, in place of the demo's "Needs attention". */
function DataHealth({ m }: { m: Metrics }) {
  const navigate = useNavigate()
  const items = metricDefs.flatMap((d) => {
    const r = m[d.key]
    if (!r) return []
    if (r.status === 'off') return [{ key: d.key, tone: 'neutral', title: `${d.label} isn’t connected`, detail: d.blurb }]
    if (r.status === 'needs_setup') return [{ key: d.key, tone: 'warn', title: `${d.label} needs setup`, detail: r.detail }]
    if (r.status === 'error') return [{ key: d.key, tone: 'error', title: `${d.label} query failed`, detail: r.detail }]
    const notes = [r.note, r.truncated && 'Too many rows to read in one go, so this covers the newest rows only.', r.mappedBy === 'detected' && 'Detected automatically. Confirm it on Data & setup.'].filter(Boolean)
    return notes.length ? [{ key: d.key, tone: r.note || r.truncated ? 'warn' : 'info', title: `${d.label}: ${r.source}`, detail: notes.join(' ') }] : []
  })
  return (
    <Card>
      <CardHeader title="Data health" right={<span className="text-xs text-subtle">{items.length} items</span>} />
      <div className="p-2">
        {items.length === 0 && <div className="py-8 text-center text-xs text-subtle">Every metric is connected and confirmed.</div>}
        {items.map((it) => (
          <button key={it.key} onClick={() => navigate('/growth/setup')} className="flex w-full cursor-pointer items-center gap-3 rounded-lg px-2 py-2.5 text-left hover:bg-hover">
            <span
              className={cn(
                'grid h-7 w-7 shrink-0 place-items-center rounded-md',
                it.tone === 'error' ? 'bg-red-500/12 text-red-400' : it.tone === 'warn' ? 'bg-amber-500/12 text-amber-400' : 'bg-hover text-subtle',
              )}
            >
              {it.tone === 'neutral' ? <Unplug size={14} /> : it.tone === 'info' ? <Settings2 size={14} /> : <AlertCircle size={14} />}
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] font-medium">{it.title}</div>
              <div className="truncate text-xs text-subtle">{it.detail}</div>
            </div>
            <ChevronRight size={14} className="text-subtle" />
          </button>
        ))}
      </div>
    </Card>
  )
}
