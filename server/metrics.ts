// Computes one Growth metric for a date range from its mapping. Each call stays well under the
// Workers subrequest limit: two counts plus at most ~20 pages of rows.
import { AUTH_USERS, setupProblem, type MetricMap, type MetricResultCore as MetricResult, type Range } from '../src/shared/metrics.ts'
import { AppData, filterQuery } from './appData.ts'

const HOUR = 3_600_000
const DAY = 24 * HOUR
const MAX_PAGES = 20
const MAX_COUNT_BUCKETS = 12

type Window = { start: Date; end: Date; prevStart: Date; bucketMs: number; n: number }

export function windowFor(range: Range, now = new Date()): Window {
  if (range === 'today') {
    const end = new Date(Math.ceil(now.getTime() / HOUR) * HOUR)
    const start = new Date(end.getTime() - 24 * HOUR)
    return { start, end: now, prevStart: new Date(start.getTime() - 24 * HOUR), bucketMs: HOUR, n: 24 }
  }
  const n = { '7d': 7, '30d': 30, '90d': 90, custom: 14 }[range]
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  const start = new Date(today - (n - 1) * DAY)
  return { start, end: now, prevStart: new Date(start.getTime() - n * DAY), bucketMs: DAY, n }
}

const iso = (d: Date) => d.toISOString()

export async function computeMetric(db: AppData, m: MetricMap, range: Range): Promise<MetricResult> {
  const problem = setupProblem(m)
  if (problem) return { status: 'needs_setup', detail: problem }
  const w = windowFor(range)
  const buckets = Array.from({ length: w.n }, (_, i) => iso(new Date(w.start.getTime() + i * w.bucketMs)))
  const series = new Array<number>(w.n).fill(0)
  const bucketOf = (t: Date) => Math.min(w.n - 1, Math.floor((t.getTime() - w.start.getTime()) / w.bucketMs))

  try {
    // Supabase Auth users: page through the admin API (newest first).
    if (m.table === AUTH_USERS) {
      const { dates, truncated } = await db.authUserDates(w.prevStart, MAX_PAGES)
      let previous = 0
      for (const d of dates) {
        if (d >= w.start && d <= w.end) series[bucketOf(d)]++
        else if (d >= w.prevStart && d < w.start) previous++
      }
      return { status: 'ok', value: sum(series), previous, buckets, series, truncated }
    }

    const filters = filterQuery(m.filters)
    const between = (from: Date, to: Date) => [filters, `${m.dateColumn}=gte.${iso(from)}`, `${m.dateColumn}=lt.${iso(to)}`].filter(Boolean).join('&')
    const current = between(w.start, w.end)
    const previousQ = between(w.prevStart, w.start)

    if (m.value.kind === 'count') {
      const [value, previous] = await Promise.all([db.count(m.table, current), db.count(m.table, previousQ)])
      if (value <= MAX_PAGES * 1000) {
        const { rows } = await db.rows(m.table, m.dateColumn, `${current}&order=${m.dateColumn}.desc`, MAX_PAGES)
        for (const r of rows) series[bucketOf(new Date(String(r[m.dateColumn])))]++
        return { status: 'ok', value, previous, buckets, series, truncated: false }
      }
      // Too many rows to fetch: count coarser buckets instead.
      const per = Math.ceil(w.n / MAX_COUNT_BUCKETS)
      const coarse = Array.from({ length: Math.ceil(w.n / per) }, (_, i) => new Date(w.start.getTime() + i * per * w.bucketMs))
      const counts = await Promise.all(coarse.map((from, i) => db.count(m.table, between(from, coarse[i + 1] ?? w.end))))
      return { status: 'ok', value, previous, buckets: coarse.map(iso), series: counts, truncated: false }
    }

    // sum / price: fetch the rows and add them up.
    const v = m.value
    const select = `${m.dateColumn},${v.column}`
    const amount = (r: Record<string, unknown>) => {
      if (v.kind === 'sum') return (Number(r[v.column]) || 0) / (v.divideBy || 1)
      const p = v.prices[String(r[v.column])]
      return Number.isFinite(p) ? p : 0
    }
    const [cur, prev] = await Promise.all([
      db.rows(m.table, select, `${current}&order=${m.dateColumn}.desc`, MAX_PAGES / 2),
      db.rows(m.table, select, `${previousQ}&order=${m.dateColumn}.desc`, MAX_PAGES / 2),
    ])
    for (const r of cur.rows) series[bucketOf(new Date(String(r[m.dateColumn])))] += amount(r)
    const unpriced = v.kind === 'price' ? new Set(cur.rows.map((r) => String(r[v.column])).filter((x) => !Number.isFinite(v.prices[x]))) : new Set<string>()
    return {
      status: 'ok',
      value: sum(series),
      previous: sum(prev.rows.map(amount)),
      buckets,
      series,
      truncated: cur.truncated || prev.truncated,
      ...(unpriced.size ? { note: `No price for ${[...unpriced].slice(0, 3).join(', ')}${unpriced.size > 3 ? '…' : ''}, so those rows count as $0.` } : {}),
    }
  } catch (e) {
    return { status: 'error', detail: (e as Error).message }
  }
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)
