import type { CheckReport, ServerApp, SourcesInput } from '../shared/sources'

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
    res = await fetch(`/api${path}`, {
      method,
      headers: { 'X-Apphub': '1', ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    })
  } catch {
    throw new ApiError('Can’t reach the apphub server. Is `npm run dev` running?', 0)
  }
  if (res.status === 401 && !path.startsWith('/auth/')) window.dispatchEvent(new Event('apphub:signed-out'))
  if (res.status === 204) return undefined as T
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new ApiError(data.error ?? `Request failed (${res.status})`, res.status, data.report)
  return data as T
}

export type AppFields = { name: string; color: string; platforms: string }
export type Rows = { rows: Record<string, unknown>[]; count: number | null; pageSize: number }

export const api = {
  me: () => req<{ required: boolean; authenticated: boolean }>('GET', '/auth/me'),
  login: (password: string) => req<{ ok: true }>('POST', '/auth/login', { password }),
  logout: () => req<{ ok: true }>('POST', '/auth/logout'),
  listApps: () => req<ServerApp[]>('GET', '/apps'),
  checkSources: (sources: SourcesInput, appId?: string) => req<CheckReport>('POST', '/apps/check', { sources, appId }),
  createApp: (fields: AppFields & { sources: SourcesInput }) => req<ServerApp>('POST', '/apps', fields),
  updateApp: (id: string, patch: Partial<AppFields> & { sources?: SourcesInput }) => req<ServerApp>('PATCH', `/apps/${id}`, patch),
  deleteApp: (id: string) => req<void>('DELETE', `/apps/${id}`),
  recheck: (id: string) => req<ServerApp>('POST', `/apps/${id}/check`),
  tableRows: (id: string, table: string, page: number) => req<Rows>('GET', `/apps/${id}/tables/${encodeURIComponent(table)}?page=${page}`),
  authUsers: (id: string, page: number) => req<Rows>('GET', `/apps/${id}/auth-users?page=${page}`),
}
