// API client. The access token lives only in memory (never localStorage); the refresh token is an
// HttpOnly cookie managed by the browser and used via /auth/refresh with a double-submit CSRF header.

export class ApiError extends Error {
  status: number
  code: string
  details?: { field?: string; message: string }[] | string[]
  retryAfter?: number
  constructor(status: number, code: string, message: string, details?: ApiError['details'], retryAfter?: number) {
    super(message)
    this.status = status
    this.code = code
    this.details = details
    this.retryAfter = retryAfter
  }
  /** Field-level validation messages keyed by field name. */
  fieldErrors(): Record<string, string> {
    const out: Record<string, string> = {}
    for (const d of (this.details ?? []) as { field?: string; message: string }[]) {
      if (typeof d === 'object' && d.field) out[d.field] = d.message
    }
    return out
  }
}

let accessToken: string | null = null
let refreshing: Promise<AuthPayload | null> | null = null
let onSessionLost: (() => void) | null = null

export interface User {
  id: number
  email: string
  name: string
  role: 'user' | 'admin'
  email_verified: boolean
  created_at: string
}
export interface AuthPayload {
  access_token: string
  expires_in: number
  user: User
}

export const setSessionLostHandler = (fn: (() => void) | null) => {
  onSessionLost = fn
}
export const setAccessToken = (t: string | null) => {
  accessToken = t
}

function csrfToken(): string {
  const m = document.cookie.match(/(?:^|;\s*)vt_csrf=([^;]+)/)
  return m ? decodeURIComponent(m[1]) : ''
}

async function parseError(res: Response): Promise<ApiError> {
  let body: any = null
  try {
    body = await res.json()
  } catch {
    /* non-JSON error */
  }
  const e = body?.error
  const retry = Number(res.headers.get('retry-after')) || undefined
  return new ApiError(res.status, e?.code ?? 'http_error', e?.message ?? `Request failed (${res.status})`, e?.details, retry)
}

/** Single-flight refresh: concurrent 401s share one rotation of the refresh token. */
export function refreshSession(): Promise<AuthPayload | null> {
  if (!refreshing) {
    refreshing = (async () => {
      for (let attempt = 0; attempt < 3; attempt++) {
        const res = await fetch('/api/auth/refresh', { method: 'POST', credentials: 'include', headers: { 'X-CSRF-Token': csrfToken() } })
        if (res.ok) {
          const data = (await res.json()) as AuthPayload
          accessToken = data.access_token
          return data
        }
        const err = await parseError(res)
        if (err.code === 'refresh_race') {
          await new Promise((r) => setTimeout(r, 250 * (attempt + 1)))
          continue
        }
        break
      }
      accessToken = null
      return null
    })().finally(() => {
      refreshing = null
    })
  }
  return refreshing
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  body?: unknown
  query?: Record<string, string | number | boolean | null | undefined>
  auth?: boolean
}

function buildUrl(path: string, query?: RequestOptions['query']): string {
  const url = new URL(`/api${path}`, window.location.origin)
  for (const [k, v] of Object.entries(query ?? {})) {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v))
  }
  return url.pathname + url.search
}

async function send(path: string, opts: RequestOptions): Promise<Response> {
  const headers: Record<string, string> = {}
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json'
  if (opts.auth !== false && accessToken) headers.Authorization = `Bearer ${accessToken}`
  return fetch(buildUrl(path, opts.query), {
    method: opts.method ?? 'GET',
    headers,
    credentials: 'include',
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  })
}

async function request(path: string, opts: RequestOptions): Promise<Response> {
  let res = await send(path, opts)
  if (res.status === 401 && opts.auth !== false) {
    const refreshed = await refreshSession()
    if (!refreshed) {
      onSessionLost?.()
      throw await parseError(res)
    }
    res = await send(path, opts)
  }
  if (!res.ok) throw await parseError(res)
  return res
}

export async function api<T = any>(path: string, opts: RequestOptions = {}): Promise<T> {
  const res = await request(path, opts)
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

export async function download(path: string, filename: string, query?: RequestOptions['query']): Promise<void> {
  const res = await request(path, { query })
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export async function logoutRequest(): Promise<void> {
  try {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include', headers: { 'X-CSRF-Token': csrfToken() } })
  } finally {
    accessToken = null
  }
}

export interface ListResponse<T> {
  items: T[]
  total: number
  limit: number
  offset: number
}
