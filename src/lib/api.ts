import type { CheckReport, ServerApp, SourcesInput } from '../shared/sources'
import { accessToken } from './auth'
import type { ListKey, Mapping, MappingState, MetricKey, MetricResult, Range } from '../shared/metrics'

export class ApiError extends Error {
  status: number
  report?: CheckReport
  constructor(message: string, status: number, report?: CheckReport) {
    super(message)
    this.status = status
    this.report = report
  }
}

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response
  try {
    const token = await accessToken()
    res = await fetch(`/api${path}`, {
      method,
      headers: { 'X-Apphub': '1', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    })
  } catch {
    throw new ApiError('Can’t reach the apphub server. Is `npm run dev` running?', 0)
  }
  if (res.status === 401) window.dispatchEvent(new Event('apphub:signed-out'))
  if (res.status === 204) return undefined as T
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new ApiError(data.error ?? `Request failed (${res.status})`, res.status, data.report)
  return data as T
}

export type AppFields = { name: string; color: string; platforms: string }
export type Me = { id: string; email: string; role: 'owner' | 'member'; apps: Record<string, 'editor' | 'viewer'> }
export type ListResult = { status: 'off' } | { status: 'error'; detail: string } | ({ status: 'ok'; table: string } & Rows)
export type Rows = { rows: Record<string, unknown>[]; count: number | null; pageSize: number }

export const api = {
  me: () => req<Me>('GET', '/auth/me'),
  listApps: () => req<ServerApp[]>('GET', '/apps'),
  checkSources: (sources: SourcesInput, appId?: string) => req<CheckReport>('POST', '/apps/check', { sources, appId }),
  createApp: (fields: AppFields & { sources: SourcesInput }) => req<ServerApp>('POST', '/apps', fields),
  updateApp: (id: string, patch: Partial<AppFields> & { sources?: SourcesInput }) => req<ServerApp>('PATCH', `/apps/${id}`, patch),
  deleteApp: (id: string) => req<void>('DELETE', `/apps/${id}`),
  recheck: (id: string) => req<ServerApp>('POST', `/apps/${id}/check`),
  tableRows: (id: string, table: string, page: number) => req<Rows>('GET', `/apps/${id}/tables/${encodeURIComponent(table)}?page=${page}`),
  authUsers: (id: string, page: number) => req<Rows>('GET', `/apps/${id}/auth-users?page=${page}`),
  mapping: (id: string) => req<MappingState>('GET', `/apps/${id}/mapping`),
  detectMapping: (id: string) => req<MappingState>('POST', `/apps/${id}/mapping/detect`),
  saveMapping: (id: string, mapping: Mapping) => req<MappingState>('PUT', `/apps/${id}/mapping`, mapping),
  values: (id: string, table: string, column: string) =>
    req<{ value: string; count: number }[]>('GET', `/apps/${id}/values?table=${encodeURIComponent(table)}&column=${encodeURIComponent(column)}`),
  metric: (id: string, key: MetricKey, range: Range) => req<MetricResult>('GET', `/apps/${id}/metrics/${key}?range=${range}`),
  list: (id: string, key: ListKey, page: number) => req<ListResult>('GET', `/apps/${id}/lists/${key}?page=${page}`),
}
