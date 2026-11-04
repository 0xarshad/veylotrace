import { useEffect, useState, type ReactNode } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  Activity, BookOpen, Bot, CalendarCheck, ClipboardList, GraduationCap, HeartPulse, LayoutDashboard, LogOut, Menu, Moon, PanelLeftClose, PanelLeftOpen, PieChart, Settings as Cog, Sun, Trophy, Users, Utensils, Wallet, X,
} from 'lucide-react'
import clsx from 'clsx'
import { useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import { useAuth } from '@/auth/AuthContext'
import { useSettings } from '@/lib/hooks'
import { useTheme } from '@/lib/theme'

const NAV: { to: string; label: string; icon: typeof Activity; tone: string }[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, tone: 'text-slate-700 dark:text-slate-300' },
  { to: '/daily', label: 'Daily Tracker', icon: CalendarCheck, tone: 'text-sky-800 dark:text-sky-300' },
  { to: '/health', label: 'Health & Fitness', icon: HeartPulse, tone: 'text-rose-800 dark:text-rose-300' },
  { to: '/expenses', label: 'Expenses & Savings', icon: Wallet, tone: 'text-emerald-800 dark:text-emerald-300' },
  { to: '/nutrition', label: 'Food & Nutrition', icon: Utensils, tone: 'text-amber-800 dark:text-amber-300' },
  { to: '/lifestyle', label: 'Lifestyle', icon: BookOpen, tone: 'text-violet-800 dark:text-violet-300' },
  { to: '/productivity', label: 'Productivity', icon: ClipboardList, tone: 'text-cyan-800 dark:text-cyan-300' },
  { to: '/learning', label: 'Learning & Growth', icon: GraduationCap, tone: 'text-indigo-800 dark:text-indigo-300' },
  { to: '/social', label: 'Social & Personal', icon: Users, tone: 'text-fuchsia-800 dark:text-fuchsia-300' },
  { to: '/challenges', label: 'Challenges', icon: Trophy, tone: 'text-yellow-800 dark:text-yellow-300' },
  { to: '/reports', label: 'Reports & Analytics', icon: PieChart, tone: 'text-teal-800 dark:text-teal-300' },
  { to: '/ai', label: 'AI Assistant', icon: Bot, tone: 'text-purple-800 dark:text-purple-300' },
  { to: '/settings', label: 'Settings', icon: Cog, tone: 'text-slate-700 dark:text-slate-300' },
]

function Brand({ collapsed = false }: { collapsed?: boolean }) {
  return (
    <div className={clsx('flex items-center py-4', collapsed ? 'justify-center px-2' : 'gap-3 px-4')}>
      <img src="/veylo-logo.svg" alt="" aria-hidden="true" className="h-10 w-10 shrink-0 drop-shadow-lg" />
      {!collapsed && <div className="min-w-0">
        <span className="block text-base font-bold tracking-tight text-slate-900 dark:text-white">VeyloTrace</span>
        <span className="block text-[10px] font-semibold uppercase tracking-[.18em] text-slate-400">Personal dashboard</span>
      </div>}
    </div>
  )
}

function NavList({ onNavigate, collapsed = false }: { onNavigate?: () => void; collapsed?: boolean }) {
  return (
    <nav aria-label="Main navigation" className={clsx('flex-1 space-y-1 overflow-y-auto pb-5', collapsed ? 'px-2' : 'px-3')}>
      {NAV.map(({ to, label, icon: Icon, tone }) => (
        <NavLink
          key={to}
          to={to}
          end={to === '/'}
          onClick={onNavigate}
          title={collapsed ? label : undefined}
          aria-label={collapsed ? label : undefined}
          className={({ isActive }) =>
            clsx('group flex items-center rounded-xl py-2.5 text-[13px] font-semibold transition duration-200', collapsed ? 'justify-center px-2.5' : 'gap-3 px-3.5', isActive ? 'bg-white/65 text-brand-700 shadow-card ring-1 ring-white/80 dark:bg-white/10 dark:text-brand-200 dark:ring-white/10' : 'text-slate-500 hover:bg-white/35 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-white/5 dark:hover:text-slate-100')
          }
        >
          <Icon className={clsx('nav-icon h-[18px] w-[18px] shrink-0', tone)} />
          {!collapsed && <span>{label}</span>}
        </NavLink>
      ))}
    </nav>
  )
}

export function Layout(): ReactNode {
  const { user, logout } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try { return localStorage.getItem('vt-sidebar-collapsed') === 'true' } catch { return false }
  })
  const [theme, setTheme] = useTheme()
  const settings = useSettings()
  const qc = useQueryClient()
  const chooseTheme = (t: 'light' | 'dark') => {
    setTheme(t)
    api('/settings', { method: 'PUT', body: { theme: t } }).then(() => qc.invalidateQueries({ queryKey: ['settings'] })).catch(() => {})
  }

  useEffect(() => {
    if (settings.data?.theme && settings.data.theme !== theme) setTheme(settings.data.theme)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.data?.theme])

  const dark = document.documentElement.classList.contains('dark')
  const toggleSidebar = () => {
    const next = !sidebarCollapsed
    setSidebarCollapsed(next)
    try { localStorage.setItem('vt-sidebar-collapsed', String(next)) } catch { /* storage may be unavailable */ }
  }
  return (
    <div className={clsx('min-h-screen transition-[padding] duration-200', sidebarCollapsed ? 'lg:pl-[5.25rem]' : 'lg:pl-64')}>
      <aside className={clsx('fixed inset-y-0 left-0 z-30 hidden flex-col border-r border-white/65 bg-white/35 backdrop-blur-lg transition-[width] duration-200 dark:border-white/10 dark:bg-slate-950/25 lg:flex', sidebarCollapsed ? 'w-[5.25rem]' : 'w-64')}>
        <Brand collapsed={sidebarCollapsed} />
        <NavList collapsed={sidebarCollapsed} />
      </aside>

      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <div className="absolute inset-0 bg-slate-900/50" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col border-r border-white/70 bg-white/65 shadow-2xl backdrop-blur-lg dark:border-white/10 dark:bg-slate-950/65">
            <div className="flex items-center justify-between pr-2">
            <Brand />
              <button className="btn-ghost p-2" aria-label="Close menu" onClick={() => setOpen(false)}>
                <X className="h-5 w-5" />
              </button>
            </div>
            <NavList onNavigate={() => setOpen(false)} />
          </aside>
        </div>
      )}

      <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-white/60 bg-white/40 px-4 shadow-sm shadow-indigo-900/5 backdrop-blur-lg dark:border-white/10 dark:bg-slate-950/30 dark:shadow-black/10 sm:px-6">
        <button className="btn-ghost p-2 lg:hidden" aria-label="Open menu" onClick={() => setOpen(true)}>
          <Menu className="h-5 w-5" />
        </button>
        <button
          className="btn-ghost hidden p-2 lg:inline-flex"
          aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-expanded={!sidebarCollapsed}
          title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          onClick={toggleSidebar}
        >
          {sidebarCollapsed ? <PanelLeftOpen className="h-5 w-5" /> : <PanelLeftClose className="h-5 w-5" />}
        </button>
        <div className="ml-auto flex items-center gap-1">
          <button className="btn-ghost p-2" aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'} onClick={() => chooseTheme(dark ? 'light' : 'dark')}>
            {dark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </button>
          <div className="mx-2 hidden text-right sm:block">
            <div className="text-sm font-medium leading-tight">{user?.name}</div>
            <div className="text-xs leading-tight text-slate-500">{user?.email}</div>
          </div>
          <button
            className="btn-ghost p-2"
            aria-label="Sign out"
            onClick={async () => {
              await logout()
              navigate('/login')
            }}
          >
            <LogOut className="h-5 w-5" />
          </button>
        </div>
      </header>

      <main className="w-full px-4 py-5 sm:px-6 sm:py-6 lg:px-8">
        <div key={location.pathname} className="route-enter">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
