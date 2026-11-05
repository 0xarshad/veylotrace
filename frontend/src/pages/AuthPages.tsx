import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { CheckCircle2, Circle } from 'lucide-react'
import { api, ApiError } from '@/api/client'
import { useAuth } from '@/auth/AuthContext'
import { SelectInput, TextInput } from '@/components/ui/Form'
import { Spinner } from '@/components/ui/Common'
import { checkPassword } from '@/lib/password'
import { errorMessage } from '@/lib/format'
import clsx from 'clsx'

function Shell({ title, subtitle, children, footer, wide = false, centerHeading = false }: { title: string; subtitle?: string; children: ReactNode; footer?: ReactNode; wide?: boolean; centerHeading?: boolean }) {
  return (
    <div className="auth-shell grid min-h-screen place-items-center px-4 py-6 sm:py-8">
      <div className={clsx('relative z-10 w-full', wide ? 'max-w-xl' : 'max-w-md')}>
        <AuthBrand />
        <div className="card auth-card p-5 sm:p-6">
          <h1 className={clsx('text-lg font-semibold', centerHeading && 'text-center')}>{title}</h1>
          {subtitle && <p className={clsx('mt-1 text-sm text-slate-500', centerHeading && 'text-center')}>{subtitle}</p>}
          <div className="mt-5">{children}</div>
        </div>
        {footer && <div className="mt-4 text-center text-sm text-slate-500">{footer}</div>}
      </div>
    </div>
  )
}

function AuthBrand() {
  return (
    <div className="mb-6 flex items-center justify-center gap-2">
      <img src="/veylo-logo.svg" alt="" aria-hidden="true" className="h-10 w-10 shrink-0" />
      <span className="text-xl font-semibold tracking-tight">VeyloTrace</span>
    </div>
  )
}

function Alert({ kind, children }: { kind: 'error' | 'success' | 'info'; children: ReactNode }) {
  const cls = { error: 'border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-200', success: 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200', info: 'border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-900 dark:bg-sky-950 dark:text-sky-200' }[kind]
  return (
    <div role={kind === 'error' ? 'alert' : 'status'} className={clsx('mb-4 rounded-lg border px-3 py-2 text-sm', cls)}>
      {children}
    </div>
  )
}

export function LoginPage() {
  const { login, status, sessionExpired } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(true)
  const [error, setError] = useState('')
  const [unverified, setUnverified] = useState(false)
  const [busy, setBusy] = useState(false)
  const [resent, setResent] = useState(false)
  const notice = (location.state as { notice?: string } | null)?.notice

  if (status === 'authed') return <Navigate to="/" replace />

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    setUnverified(false)
    try {
      await login(email, password, remember)
      navigate('/', { replace: true })
    } catch (err) {
      if (err instanceof ApiError && err.code === 'email_unverified') setUnverified(true)
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const resend = async () => {
    try {
      await api('/auth/resend-verification', { method: 'POST', auth: false, body: { email } })
      setResent(true)
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  return (
    <Shell title="Welcome back" subtitle="Sign in to your account." footer={<>New here? <Link className="font-medium text-brand-600 hover:underline" to="/register">Create an account</Link></>}>
      {sessionExpired && <Alert kind="info">Your session expired. Please sign in again.</Alert>}
      {notice && <Alert kind="success">{notice}</Alert>}
      {error && <Alert kind="error">{error}</Alert>}
      {unverified && (
        <p className="-mt-2 mb-4 text-sm">
          {resent ? 'A new verification email is on its way.' : <button className="text-brand-600 underline" onClick={resend}>Resend verification email</button>}
        </p>
      )}
      <form onSubmit={submit} className="space-y-4">
        <TextInput label="Email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <TextInput label="Password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        <div className="flex items-center justify-between text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" className="h-4 w-4 rounded border-slate-300" checked={remember} onChange={(e) => setRemember(e.target.checked)} /> Keep me signed in
          </label>
          <Link to="/forgot-password" className="text-brand-600 hover:underline">Forgot password?</Link>
        </div>
        <button className="btn-primary w-full" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
    </Shell>
  )
}

export function PasswordStrength({ password, email, name }: { password: string; email?: string; name?: string }) {
  const { checks, score } = checkPassword(password, email, name)
  const colors = ['bg-slate-200', 'bg-rose-500', 'bg-amber-500', 'bg-lime-500', 'bg-emerald-500']
  return (
    <div aria-live="polite">
      <div className="mt-2 flex gap-1" aria-hidden>
        {[1, 2, 3, 4].map((i) => <div key={i} className={clsx('h-1.5 flex-1 rounded-full', password && i <= score ? colors[score] : 'bg-slate-200 dark:bg-slate-700')} />)}
      </div>
      <ul className="mt-2 grid grid-cols-1 gap-x-4 gap-y-0.5 text-xs sm:grid-cols-2">
        {checks.map((c) => (
          <li key={c.label} className={clsx('flex items-center gap-1.5', c.ok ? 'text-emerald-600' : 'text-slate-500')}>
            {c.ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Circle className="h-3.5 w-3.5" />} {c.label}
          </li>
        ))}
      </ul>
    </div>
  )
}

export function RegisterPage() {
  const { status } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({ name: '', email: '', password: '', confirm_password: '', height_cm: '', weight_kg: '', body_fat_percent: '', sex_for_estimates: '', age_years: '', activity_level: '' })
  const [targetMode, setTargetMode] = useState<'suggested' | 'custom'>('suggested')
  const [customTarget, setCustomTarget] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState('')
  const [needsVerify, setNeedsVerify] = useState(true)
  if (status === 'authed') return <Navigate to="/" replace />
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const strength = checkPassword(form.password, form.email, form.name)
  const height = Number(form.height_cm)
  const hasHeight = Number.isFinite(height) && height > 80 && height < 250
  const heightM = height / 100
  const suggestedTarget = hasHeight ? Number((21.7 * heightM * heightM).toFixed(1)) : null
  const referenceMin = hasHeight ? Number((18.5 * heightM * heightM).toFixed(1)) : null
  const referenceMax = hasHeight ? Number((24.9 * heightM * heightM).toFixed(1)) : null
  const targetWeight = targetMode === 'suggested' ? suggestedTarget : Number(customTarget)
  const activityFactors: Record<string, number> = { sedentary: 1.2, light: 1.375, moderate: 1.55, very_active: 1.725 }
  const age = Number(form.age_years)
  const weight = Number(form.weight_kg)
  const estimatedCalories = hasHeight && weight > 20 && age >= 20 && age <= 78 && form.sex_for_estimates && activityFactors[form.activity_level]
    ? Math.max(1200, Math.round(( (10 * weight + 6.25 * height - 5 * age + (form.sex_for_estimates === 'male' ? 5 : -161)) * activityFactors[form.activity_level]) / 50) * 50)
    : null
  const starterProtein = targetWeight ? Math.max(Math.round(targetWeight * 0.8), Math.round((estimatedCalories ?? 2000) * 0.1 / 4)) : null
  const starterCarbs = estimatedCalories && starterProtein != null ? Math.round(Math.max(estimatedCalories - starterProtein * 4, 0) * 0.65 / 4) : null
  const starterFat = estimatedCalories && starterProtein != null ? Math.round(Math.max(estimatedCalories - starterProtein * 4, 0) * 0.35 / 9) : null

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setErrors({})
    if (form.password !== form.confirm_password) return setErrors({ confirm_password: 'Passwords do not match.' })
    if (!strength.valid) return setErrors({ password: 'Password does not meet the requirements.' })
    setBusy(true)
    try {
      if (!targetWeight || !Number.isFinite(targetWeight)) return setErrors({ target_weight_kg: 'Enter a target weight.' })
      const res = await api<{ message: string; verification_required: boolean }>('/auth/register', {
        method: 'POST', auth: false,
        body: { ...form, height_cm: height, weight_kg: Number(form.weight_kg), age_years: age, body_fat_percent: form.body_fat_percent ? Number(form.body_fat_percent) : null, target_weight_kg: targetWeight },
      })
      setNeedsVerify(res.verification_required)
      setDone(res.message)
    } catch (err) {
      if (err instanceof ApiError) {
        const fe = err.fieldErrors()
        if (err.code === 'email_taken') setErrors({ email: err.message })
        else if (err.code === 'weak_password') setErrors({ password: (err.details as string[] | undefined)?.join(' ') ?? err.message })
        else if (Object.keys(fe).length) setErrors(fe)
        else setError(err.message)
      } else setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  if (done)
    return (
      <Shell title={needsVerify ? 'Check your email' : 'Account created'}>
        <Alert kind="success">{done}</Alert>
        {needsVerify && <p className="text-sm text-slate-500">After verifying your address you can sign in.</p>}
        <button className="btn-primary mt-4 w-full" onClick={() => navigate('/login')}>Go to sign in</button>
      </Shell>
    )

  return (
    <Shell title="Create your account" subtitle="Your data stays private to your account." wide centerHeading footer={<>Already registered? <Link className="font-medium text-brand-600 hover:underline" to="/login">Sign in</Link></>}>
      {error && <Alert kind="error">{error}</Alert>}
      <form onSubmit={submit} className="space-y-4" noValidate>
        <TextInput label="Name" autoComplete="name" required value={form.name} onChange={set('name')} error={errors.name} maxLength={100} />
        <TextInput label="Email" type="email" autoComplete="email" required value={form.email} onChange={set('email')} error={errors.email} />
        <div className="grid gap-3 sm:grid-cols-3">
          <SelectInput label="Sex for estimates" required value={form.sex_for_estimates} onChange={set('sex_for_estimates')} options={[{ value: 'female', label: 'Female' }, { value: 'male', label: 'Male' }]} placeholder="Choose" />
          <TextInput label="Age" type="number" inputMode="numeric" min={20} max={78} step="1" required value={form.age_years} onChange={set('age_years')} error={errors.age_years} />
          <SelectInput label="Activity level" required value={form.activity_level} onChange={set('activity_level')} options={[{ value: 'sedentary', label: 'Sedentary' }, { value: 'light', label: 'Light' }, { value: 'moderate', label: 'Moderate' }, { value: 'very_active', label: 'Very active' }]} placeholder="Choose" />
        </div>
        <p className="-mt-2 text-xs text-slate-500">Sex, age and activity are used only for editable adult nutrition estimates.</p>
        <div className="grid gap-3 sm:grid-cols-3">
          <TextInput label="Height (cm)" type="number" inputMode="decimal" min={80.1} max={249.9} step="0.1" required value={form.height_cm} onChange={set('height_cm')} error={errors.height_cm} />
          <TextInput label="Current weight (kg)" type="number" inputMode="decimal" min={20.1} max={499.9} step="0.1" required value={form.weight_kg} onChange={set('weight_kg')} error={errors.weight_kg} />
          <TextInput label="Body fat (%)" type="number" inputMode="decimal" min={1} max={75} step="0.1" value={form.body_fat_percent} onChange={set('body_fat_percent')} error={errors.body_fat_percent} help="Optional if you know it." />
        </div>
        <fieldset className="space-y-2.5 rounded-xl border border-slate-200 p-3 dark:border-slate-700">
          <legend className="px-1 text-sm font-medium">Target weight</legend>
          {suggestedTarget != null && <p className="text-sm">Suggested reference: <strong>{suggestedTarget} kg</strong> · estimated adult BMI range {referenceMin}–{referenceMax} kg</p>}
          <label className="flex items-start gap-2 text-sm">
            <input type="radio" name="target-mode" className="mt-0.5" checked={targetMode === 'suggested'} onChange={() => setTargetMode('suggested')} />
            <span>Use suggested target{suggestedTarget != null ? ` (${suggestedTarget} kg)` : ''}</span>
          </label>
          <label className="flex items-start gap-2 text-sm">
            <input type="radio" name="target-mode" className="mt-0.5" checked={targetMode === 'custom'} onChange={() => setTargetMode('custom')} />
            <span>Choose my own target</span>
          </label>
          {targetMode === 'custom' && <TextInput label="Your target (kg)" type="number" inputMode="decimal" min={20.1} max={499.9} step="0.1" required value={customTarget} onChange={(e) => setCustomTarget(e.target.value)} error={errors.target_weight_kg} />}
          {estimatedCalories != null && <p className="rounded-lg bg-slate-50 p-2 text-sm dark:bg-slate-800/70">Starter nutrition estimate: <strong>{estimatedCalories} kcal</strong>, {starterProtein} g protein, {starterCarbs} g carbs and {starterFat} g fat per day. Water stays at the editable default.</p>}
          <p className="text-xs text-slate-500">The adult BMI reference range is the same for women and men. It is a screening reference, not a diagnosis or personalized medical goal. Calorie estimates use age, sex, height, current weight and activity, and can be changed later.</p>
        </fieldset>
        <div>
          <TextInput label="Password" type="password" autoComplete="new-password" required value={form.password} onChange={set('password')} error={errors.password} />
          <PasswordStrength password={form.password} email={form.email} name={form.name} />
        </div>
        <TextInput label="Confirm password" type="password" autoComplete="new-password" required value={form.confirm_password} onChange={set('confirm_password')} error={errors.confirm_password} />
        <button className="btn-primary w-full" disabled={busy}>{busy ? 'Creating account…' : 'Create account'}</button>
      </form>
    </Shell>
  )
}

export function VerifyEmailPage() {
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''
  const [state, setState] = useState<'working' | 'ok' | 'error'>('working')
  const [msg, setMsg] = useState('')
  useEffect(() => {
    if (!token) {
      setState('error')
      setMsg('This verification link is incomplete.')
      return
    }
    api<{ message: string }>('/auth/verify-email', { method: 'POST', auth: false, body: { token } })
      .then((r) => { setState('ok'); setMsg(r.message) })
      .catch((e) => { setState('error'); setMsg(errorMessage(e)) })
  }, [token])
  return (
    <Shell title="Email verification">
      {state === 'working' && <Spinner label="Verifying" />}
      {state === 'ok' && <Alert kind="success">{msg}</Alert>}
      {state === 'error' && <Alert kind="error">{msg}</Alert>}
      {state !== 'working' && <Link to="/login" className="btn-primary w-full">Go to sign in</Link>}
    </Shell>
  )
}

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await api('/auth/forgot-password', { method: 'POST', auth: false, body: { email } })
      setSent(true)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Shell title="Reset your password" subtitle="We'll email you a single-use link if the address is registered." footer={<Link className="text-brand-600 hover:underline" to="/login">Back to sign in</Link>}>
      {sent ? <Alert kind="success">If that address is registered, a reset link is on its way. It expires in 1 hour.</Alert> : (
        <form onSubmit={submit} className="space-y-4">
          {error && <Alert kind="error">{error}</Alert>}
          <TextInput label="Email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <button className="btn-primary w-full" disabled={busy}>{busy ? 'Sending…' : 'Send reset link'}</button>
        </form>
      )}
    </Shell>
  )
}

export function ResetPasswordPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const token = params.get('token') ?? ''
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    if (password !== confirm) return setError('Passwords do not match.')
    setBusy(true)
    try {
      await api('/auth/reset-password', { method: 'POST', auth: false, body: { token, password, confirm_password: confirm } })
      navigate('/login', { state: { notice: 'Password updated. Sign in with your new password.' } })
    } catch (err) {
      setError(err instanceof ApiError && err.code === 'weak_password' ? (err.details as string[]).join(' ') : errorMessage(err))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Shell title="Choose a new password" footer={<Link className="text-brand-600 hover:underline" to="/login">Back to sign in</Link>}>
      {!token ? <Alert kind="error">This reset link is incomplete.</Alert> : (
        <form onSubmit={submit} className="space-y-4">
          {error && <Alert kind="error">{error}</Alert>}
          <div>
            <TextInput label="New password" type="password" autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
            <PasswordStrength password={password} />
          </div>
          <TextInput label="Confirm new password" type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          <button className="btn-primary w-full" disabled={busy}>{busy ? 'Saving…' : 'Update password'}</button>
        </form>
      )}
    </Shell>
  )
}
