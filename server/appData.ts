// Reads from an app's own Supabase with its secret key (PostgREST + the Auth admin API).
// Plain fetch so each call is one subrequest; Workers cap those per request.
import type { Filter, TableSchema } from '../src/shared/metrics.ts'
import type { SourcesInput } from '../src/shared/sources.ts'

export const PAGE_ROWS = 1000

export class AppData {
  private url: string
  private headers: Record<string, string>

  constructor(s: SourcesInput) {
    this.url = s.supabase.url
    this.headers = { apikey: s.supabase.secretKey, Authorization: `Bearer ${s.supabase.secretKey}` }
  }

  private async get(path: string, extra: Record<string, string> = {}) {
    const res = await fetch(`${this.url}${path}`, { headers: { ...this.headers, ...extra } })
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { message?: string; msg?: string } | null
      throw new Error(body?.message ?? body?.msg ?? `Supabase returned ${res.status}`)
    }
    return res
  }

  /** Tables and views the REST API exposes, with column names and Postgres types. */
  async schema(): Promise<TableSchema[]> {
    const res = await this.get('/rest/v1/', { Accept: 'application/openapi+json' })
    const spec = (await res.json()) as { definitions?: Record<string, { properties?: Record<string, { format?: string; type?: string }> }> }
    return Object.entries(spec.definitions ?? {})
      .map(([name, d]) => ({ name, columns: Object.entries(d.properties ?? {}).map(([c, p]) => ({ name: c, type: p.format ?? p.type ?? 'unknown' })) }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }

  /** Distinct values of a column among the newest rows (a sample, for filters and price lists). */
  async values(table: string, column: string, sample = PAGE_ROWS): Promise<{ value: string; count: number }[]> {
    const res = await this.get(`/rest/v1/${table}?select=${column}&limit=${sample}`)
    const rows = (await res.json()) as Record<string, unknown>[]
    const counts = new Map<string, number>()
    for (const r of rows) {
      const v = r[column]
      if (v === null || v === undefined || typeof v === 'object') continue
      counts.set(String(v), (counts.get(String(v)) ?? 0) + 1)
    }
    return [...counts].map(([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count).slice(0, 50)
  }

  async count(table: string, query: string): Promise<number> {
    const res = await this.get(`/rest/v1/${table}?select=*&${query}`, { Prefer: 'count=exact', Range: '0-0', 'Range-Unit': 'items' })
    return Number(res.headers.get('content-range')?.split('/')[1] ?? 0)
  }

  /** One page of whole rows plus the total count, for list views. */
  async page(table: string, query: string, page: number, size: number): Promise<{ rows: Record<string, unknown>[]; count: number | null }> {
    const from = page * size
    const res = await this.get(`/rest/v1/${table}?select=*${query ? `&${query}` : ''}`, { Prefer: 'count=exact', Range: `${from}-${from + size - 1}`, 'Range-Unit': 'items' })
    const count = Number(res.headers.get('content-range')?.split('/')[1])
    return { rows: (await res.json()) as Record<string, unknown>[], count: Number.isFinite(count) ? count : null }
  }

  /** Rows in pages of PAGE_ROWS, up to maxPages. */
  async rows(table: string, select: string, query: string, maxPages: number): Promise<{ rows: Record<string, unknown>[]; truncated: boolean }> {
    const rows: Record<string, unknown>[] = []
    for (let page = 0; page < maxPages; page++) {
      const res = await this.get(`/rest/v1/${table}?select=${select}&${query}&limit=${PAGE_ROWS}&offset=${page * PAGE_ROWS}`)
      const batch = (await res.json()) as Record<string, unknown>[]
      rows.push(...batch)
      if (batch.length < PAGE_ROWS) return { rows, truncated: false }
    }
    return { rows, truncated: true }
  }

  /** Auth users' created_at, newest first, stopping once past `since`. */
  async authUserDates(since: Date, maxPages: number): Promise<{ dates: Date[]; truncated: boolean }> {
    const dates: Date[] = []
    for (let page = 1; page <= maxPages; page++) {
      const res = await this.get(`/auth/v1/admin/users?page=${page}&per_page=${PAGE_ROWS}`)
      const { users } = (await res.json()) as { users: { created_at: string }[] }
      const batch = users.map((u) => new Date(u.created_at))
      dates.push(...batch)
      if (users.length < PAGE_ROWS || batch.every((d) => d < since)) return { dates, truncated: false }
    }
    return { dates, truncated: true }
  }
}

/** PostgREST query string for filters (column names are validated before they get here). */
export function filterQuery(filters: Filter[]) {
  return filters
    .map((f) => {
      const v = f.value.trim()
      const val =
        f.op === 'in'
          ? `in.(${v.split(',').map((x) => `"${x.trim().replace(/"/g, '\\"')}"`).join(',')})`
          : f.op === 'is'
            ? `is.${/^(true|false|null)$/i.test(v) ? v.toLowerCase() : 'null'}`
            : `${f.op}.${v}`
      return `${f.column}=${encodeURIComponent(val)}`
    })
    .join('&')
}
