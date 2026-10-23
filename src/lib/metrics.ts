import { useEffect, useState } from 'react'
import { api } from './api'
import type { MetricKey, MetricResult, Range } from '../shared/metrics'

// Metric results per app + range, kept for a minute so switching tabs doesn't refetch.
const cache = new Map<string, { at: number; p: Promise<MetricResult> }>()
const TTL = 60_000

/** Drop cached numbers for an app after its mapping or sources change. */
export function forgetMetrics(appId: string) {
  for (const k of cache.keys()) if (k.startsWith(`${appId}|`)) cache.delete(k)
}

function load(appId: string, key: MetricKey, range: Range) {
  const k = `${appId}|${key}|${range}`
  const hit = cache.get(k)
  if (hit && Date.now() - hit.at < TTL) return hit.p
  const p = api.metric(appId, key, range).catch((e: Error): MetricResult => ({ status: 'error', detail: e.message }))
  cache.set(k, { at: Date.now(), p })
  return p
}

/** null while loading. */
export function useMetric(appId: string, key: MetricKey, range: Range, version = 0) {
  const [state, setState] = useState<{ k: string; r: MetricResult } | null>(null)
  const k = `${appId}|${key}|${range}|${version}`
  useEffect(() => {
    let live = true
    load(appId, key, range).then((r) => live && setState({ k, r }))
    return () => { live = false }
  }, [appId, key, range, k])
  return state?.k === k ? state.r : null
}

/** Percent change, or null when there's nothing to compare against. */
export function change(value: number, previous: number) {
  if (!previous) return null
  return Math.round(((value - previous) / previous) * 1000) / 10
}

/** Matches the server's windows (custom = last 14 days until a date picker exists). */
export const liveRangeLabel = (r: Range) => (r === 'today' ? 'last 24 hours' : `last ${{ '7d': 7, '30d': 30, '90d': 90, custom: 14 }[r]} days`)
