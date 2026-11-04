import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { api, logoutRequest, refreshSession, setAccessToken, setSessionLostHandler, type AuthPayload, type User } from '@/api/client'

type Status = 'loading' | 'authed' | 'anon'

interface AuthCtx {
  status: Status
  user: User | null
  login: (email: string, password: string, remember: boolean) => Promise<void>
  logout: () => Promise<void>
  sessionExpired: boolean
}

const Ctx = createContext<AuthCtx | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('loading')
  const [user, setUser] = useState<User | null>(null)
  const [sessionExpired, setSessionExpired] = useState(false)
  const qc = useQueryClient()

  const drop = useCallback(() => {
    setAccessToken(null)
    setUser(null)
    setStatus('anon')
    qc.clear()
  }, [qc])

  useEffect(() => {
    setSessionLostHandler(() => {
      setSessionExpired(true)
      drop()
    })
    // Restore a "remembered" session from the refresh cookie on first load.
    let cancelled = false
    // No CSRF cookie means there is no refresh session to restore (avoids a pointless 403 on first visit).
    if (!document.cookie.includes('vt_csrf=')) {
      setStatus('anon')
      return () => setSessionLostHandler(null)
    }
    refreshSession().then((data) => {
      if (cancelled) return
      if (data) {
        setUser(data.user)
        setStatus('authed')
      } else setStatus('anon')
    })
    return () => {
      cancelled = true
      setSessionLostHandler(null)
    }
  }, [drop])

  const login = useCallback(async (email: string, password: string, remember: boolean) => {
    const data = await api<AuthPayload>('/auth/login', { method: 'POST', auth: false, body: { email, password, remember } })
    setAccessToken(data.access_token)
    setUser(data.user)
    setSessionExpired(false)
    setStatus('authed')
  }, [])

  const logout = useCallback(async () => {
    await logoutRequest()
    setSessionExpired(false)
    drop()
  }, [drop])

  const value = useMemo(() => ({ status, user, login, logout, sessionExpired }), [status, user, login, logout, sessionExpired])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAuth(): AuthCtx {
  const v = useContext(Ctx)
  if (!v) throw new Error('useAuth must be used inside AuthProvider')
  return v
}
