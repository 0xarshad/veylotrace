import { lazy, Suspense, Component, type ReactNode } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ApiError } from '@/api/client'
import { AuthProvider, useAuth } from '@/auth/AuthContext'
import { Layout } from '@/components/Layout'
import { ConfirmProvider } from '@/components/ui/Modal'
import { ToastProvider } from '@/components/ui/Toast'
import { Spinner } from '@/components/ui/Common'
import { ForgotPasswordPage, LoginPage, RegisterPage, ResetPasswordPage, VerifyEmailPage } from '@/pages/AuthPages'

const Dashboard = lazy(() => import('@/pages/Dashboard'))
const DailyTracker = lazy(() => import('@/pages/DailyTracker'))
const Health = lazy(() => import('@/pages/Health'))
const Finance = lazy(() => import('@/pages/Finance'))
const Nutrition = lazy(() => import('@/pages/Nutrition'))
const Lifestyle = lazy(() => import('@/pages/Lifestyle'))
const Productivity = lazy(() => import('@/pages/Productivity'))
const Learning = lazy(() => import('@/pages/Learning'))
const Social = lazy(() => import('@/pages/Social'))
const Challenges = lazy(() => import('@/pages/Challenges'))
const Reports = lazy(() => import('@/pages/Reports'))
const AI = lazy(() => import('@/pages/AI'))
const SettingsPage = lazy(() => import('@/pages/Settings'))

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      refetchOnWindowFocus: false,
      retry: (count, err) => !(err instanceof ApiError && err.status < 500) && count < 2,
    },
  },
})

class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    if (!this.state.failed) return this.props.children
    return (
      <div className="grid min-h-screen place-items-center p-6 text-center">
        <div>
          <h1 className="text-lg font-semibold">Something went wrong</h1>
          <p className="mt-1 text-sm text-slate-500">The page hit an unexpected error. Your data is safe.</p>
          <button className="btn-primary mt-4" onClick={() => location.reload()}>Reload</button>
        </div>
      </div>
    )
  }
}

function Protected() {
  const { status } = useAuth()
  if (status === 'loading') return <div className="grid min-h-screen place-items-center"><Spinner /></div>
  if (status === 'anon') return <Navigate to="/login" replace />
  return <Layout />
}

export default function App() {
  return (
    <Boundary>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <ConfirmProvider>
            <AuthProvider>
              <BrowserRouter>
                <Suspense fallback={<div className="grid min-h-screen place-items-center"><Spinner /></div>}>
                  <Routes>
                    <Route path="/login" element={<LoginPage />} />
                    <Route path="/register" element={<RegisterPage />} />
                    <Route path="/verify-email" element={<VerifyEmailPage />} />
                    <Route path="/forgot-password" element={<ForgotPasswordPage />} />
                    <Route path="/reset-password" element={<ResetPasswordPage />} />
                    <Route element={<Protected />}>
                      <Route index element={<Dashboard />} />
                      <Route path="daily" element={<DailyTracker />} />
                      <Route path="health" element={<Health />} />
                      <Route path="expenses" element={<Finance />} />
                      <Route path="nutrition" element={<Nutrition />} />
                      <Route path="lifestyle" element={<Lifestyle />} />
                      <Route path="productivity" element={<Productivity />} />
                      <Route path="learning" element={<Learning />} />
                      <Route path="social" element={<Social />} />
                      <Route path="challenges" element={<Challenges />} />
                      <Route path="reports" element={<Reports />} />
                      <Route path="ai" element={<AI />} />
                      <Route path="settings" element={<SettingsPage />} />
                    </Route>
                    <Route path="*" element={<Navigate to="/" replace />} />
                  </Routes>
                </Suspense>
              </BrowserRouter>
            </AuthProvider>
          </ConfirmProvider>
        </ToastProvider>
      </QueryClientProvider>
    </Boundary>
  )
}
