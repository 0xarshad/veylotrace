import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api, ApiError, refreshSession, setAccessToken, setSessionLostHandler } from '@/api/client'

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } })

const AUTH = { access_token: 'new-token', expires_in: 900, user: { id: 1, email: 'a@b.c', name: 'A', role: 'user', email_verified: true, created_at: '' } }

describe('api client', () => {
  let fetchMock: ReturnType<typeof vi.fn>
  beforeEach(() => {
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    document.cookie = 'vt_csrf=csrf123'
    setAccessToken('old-token')
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    setSessionLostHandler(null)
    setAccessToken(null)
  })

  it('sends the bearer token from memory and never touches web storage', async () => {
    fetchMock.mockResolvedValueOnce(json({ ok: true }))
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    await api('/things', { query: { q: 'x', empty: '' } })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/things?q=x')
    expect(init.headers.Authorization).toBe('Bearer old-token')
    expect(init.credentials).toBe('include')
    expect(setItem).not.toHaveBeenCalled()
  })

  it('refreshes once on 401 (with CSRF header) and retries the request', async () => {
    fetchMock
      .mockResolvedValueOnce(json({ error: { code: 'token_expired', message: 'expired' } }, 401))
      .mockResolvedValueOnce(json(AUTH))
      .mockResolvedValueOnce(json({ ok: 1 }))
    expect(await api('/things')).toEqual({ ok: 1 })
    const refreshCall = fetchMock.mock.calls[1]
    expect(refreshCall[0]).toBe('/api/auth/refresh')
    expect(refreshCall[1].headers['X-CSRF-Token']).toBe('csrf123')
    expect(fetchMock.mock.calls[2][1].headers.Authorization).toBe('Bearer new-token')
  })

  it('shares a single refresh between concurrent 401s (refresh-token rotation safety)', async () => {
    let refreshCalls = 0
    fetchMock.mockImplementation(async (url: string, init: RequestInit) => {
      if (url === '/api/auth/refresh') {
        refreshCalls++
        return json(AUTH)
      }
      const auth = (init.headers as Record<string, string>).Authorization
      return auth === 'Bearer new-token' ? json({ ok: true }) : json({ error: { code: 'token_expired', message: 'x' } }, 401)
    })
    await Promise.all([api('/a'), api('/b'), api('/c')])
    expect(refreshCalls).toBe(1)
  })

  it('signals session loss when refresh fails', async () => {
    const lost = vi.fn()
    setSessionLostHandler(lost)
    fetchMock.mockImplementation(async (url: string) =>
      url === '/api/auth/refresh' ? json({ error: { code: 'session_revoked', message: 'gone' } }, 401) : json({ error: { code: 'unauthorized', message: 'no' } }, 401),
    )
    await expect(api('/things')).rejects.toBeInstanceOf(ApiError)
    expect(lost).toHaveBeenCalledOnce()
  })

  it('retries a refresh race instead of logging out', async () => {
    fetchMock
      .mockResolvedValueOnce(json({ error: { code: 'refresh_race', message: 'busy' } }, 409))
      .mockResolvedValueOnce(json(AUTH))
    const res = await refreshSession()
    expect(res?.access_token).toBe('new-token')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('does not try to refresh for unauthenticated endpoints (login)', async () => {
    fetchMock.mockResolvedValueOnce(json({ error: { code: 'invalid_credentials', message: 'Invalid email or password.' } }, 401))
    await expect(api('/auth/login', { method: 'POST', auth: false, body: { email: 'x' } })).rejects.toMatchObject({ code: 'invalid_credentials', status: 401 })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBeUndefined()
  })

  it('exposes field errors from validation responses', async () => {
    fetchMock.mockResolvedValueOnce(json({ error: { code: 'validation_error', message: 'bad', details: [{ field: 'amount', message: 'too small' }] } }, 422))
    const err = await api('/expenses', { method: 'POST', body: {} }).catch((e) => e)
    expect(err.fieldErrors()).toEqual({ amount: 'too small' })
  })
})
