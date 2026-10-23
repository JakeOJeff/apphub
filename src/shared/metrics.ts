// Which of an app's tables feed each Growth metric and list. Shared by the browser and the API server.
// The server detects a mapping from the app's schema; anything it can't work out is configured on
// Growth → Data & setup. Real apps only ever show numbers computed from these mappings.

export const metricDefs = [
  { key: 'clicks', label: 'Clicks', group: 'acq', blurb: 'Taps on links that open or install the app.' },
  { key: 'installs', label: 'Installs', group: 'acq', blurb: 'First opens after an install.' },
  { key: 'signups', label: 'Signups', group: 'acq', blurb: 'New accounts.' },
  { key: 'trials', label: 'Trials', group: 'mon', blurb: 'Free trials started.' },
  { key: 'subscriptions', label: 'Subscriptions', group: 'mon', blurb: 'Paid subscriptions started.' },
  { key: 'revenue', label: 'Revenue', group: 'mon', blurb: 'Money in, from a payments table or a price per product.' },
] as const

export const listDefs = [
  { key: 'links', label: 'Deep links', blurb: 'One row per link.' },
  { key: 'coupons', label: 'Coupons', blurb: 'One row per coupon or offer code.' },
  { key: 'referrals', label: 'Referrals', blurb: 'One row per referral or referral code.' },
  { key: 'campaigns', label: 'Campaigns', blurb: 'One row per campaign.' },
] as const

export type MetricKey = (typeof metricDefs)[number]['key']
export type ListKey = (typeof listDefs)[number]['key']

/** Supabase Auth's user list, read through the admin API. */
export const AUTH_USERS = 'auth.users'

export type FilterOp = 'eq' | 'neq' | 'in' | 'is'
/** `in` takes comma-separated values; `is` takes true, false or null. */
export type Filter = { column: string; op: FilterOp; value: string }

export type MetricValue =
  | { kind: 'count' }
  | { kind: 'sum'; column: string; /** e.g. 100 when the column holds cents */ divideBy?: number }
  | { kind: 'price'; column: string; /** column value (e.g. product id) -> price */ prices: Record<string, number> }

export type MetricMap = { table: string; dateColumn: string; filters: Filter[]; value: MetricValue }
export type ListMap = { table: string; filters: Filter[] }

/** Saved by a person. A missing key falls back to the detected mapping; null turns it off. */
export type Mapping = {
  metrics: Partial<Record<MetricKey, MetricMap | null>>
  lists: Partial<Record<ListKey, ListMap | null>>
}

export type Confidence = 'high' | 'medium' | 'low'
export type Suggestion<T> = { map: T | null; confidence: Confidence; reason: string }

export type Detected = {
  at: string
  metrics: Record<MetricKey, Suggestion<MetricMap>>
  lists: Record<ListKey, Suggestion<ListMap>>
}

export type Column = { name: string; type: string }
export type TableSchema = { name: string; columns: Column[] }

export type MappingState = { tables: TableSchema[]; detected: Detected; saved: Mapping }

export const emptyMapping = (): Mapping => ({ metrics: {}, lists: {} })

export function resolveMetric(key: MetricKey, saved: Mapping | undefined, detected: Detected | undefined): { map: MetricMap | null; source: 'saved' | 'detected' } {
  if (saved && key in saved.metrics) return { map: saved.metrics[key] ?? null, source: 'saved' }
  return { map: detected?.metrics[key]?.map ?? null, source: 'detected' }
}

export function resolveList(key: ListKey, saved: Mapping | undefined, detected: Detected | undefined): { map: ListMap | null; source: 'saved' | 'detected' } {
  if (saved && key in saved.lists) return { map: saved.lists[key] ?? null, source: 'saved' }
  return { map: detected?.lists[key]?.map ?? null, source: 'detected' }
}

/** Why a mapping can't produce numbers yet, or null when it can. */
export function setupProblem(m: MetricMap): string | null {
  if (m.value.kind === 'price') {
    const priced = Object.values(m.value.prices).filter((p) => Number.isFinite(p) && p > 0)
    if (!priced.length) return `Set a price for each ${m.value.column} value.`
  }
  return null
}

export const isTimeType = (t: string) => /timestamp|date/.test(t)
export const isNumberType = (t: string) => /integer|numeric|real|double|bigint|smallint|number|money/.test(t)

export const ident = /^[A-Za-z_][A-Za-z0-9_]*$/

export type Range = 'today' | '7d' | '30d' | '90d' | 'custom'

/** The API adds where the numbers came from: describeMap() of the mapping, and whether it was detected or set by hand. */
export type MetricResult = MetricResultCore & { source?: string; mappedBy?: 'saved' | 'detected' }

export type MetricResultCore =
  | { status: 'off' }
  | { status: 'needs_setup'; detail: string }
  | { status: 'error'; detail: string }
  | {
      status: 'ok'
      value: number
      previous: number
      /** Bucket start times (ISO) and values, oldest first. */
      buckets: string[]
      series: number[]
      /** Hit the row cap; numbers cover only the newest rows. */
      truncated: boolean
      note?: string
    }

/** Plain-English summary of a mapping, e.g. "user_subscriptions · started_at · environment = Production". */
export function describeMap(m: MetricMap | ListMap) {
  const parts: string[] = [m.table === AUTH_USERS ? 'Supabase Auth users' : m.table]
  if ('dateColumn' in m) parts.push(`by ${m.dateColumn}`)
  for (const f of m.filters) parts.push(`${f.column} ${{ eq: '=', neq: '≠', in: 'in', is: 'is' }[f.op]} ${f.value}`)
  if ('value' in m) {
    if (m.value.kind === 'sum') parts.push(`sum of ${m.value.column}${m.value.divideBy && m.value.divideBy !== 1 ? ` ÷ ${m.value.divideBy}` : ''}`)
    if (m.value.kind === 'price') parts.push(`price per ${m.value.column}`)
  }
  return parts.join(' · ')
}
