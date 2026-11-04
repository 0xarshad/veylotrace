export interface PasswordCheck {
  label: string
  ok: boolean
}

/** Mirrors the backend rules for instant feedback only; the server is the source of truth. */
export function checkPassword(password: string, email = '', name = ''): { checks: PasswordCheck[]; score: number; valid: boolean } {
  const local = email.split('@')[0]?.toLowerCase() ?? ''
  const low = password.toLowerCase()
  const checks: PasswordCheck[] = [
    { label: 'At least 10 characters', ok: password.length >= 10 },
    { label: 'Lowercase letter', ok: /[a-z]/.test(password) },
    { label: 'Uppercase letter', ok: /[A-Z]/.test(password) },
    { label: 'A digit', ok: /\d/.test(password) },
    { label: 'A symbol', ok: /[^A-Za-z0-9]/.test(password) },
    { label: 'Doesn’t contain your name or email', ok: !(local.length >= 4 && low.includes(local)) && !(name.length >= 4 && low.includes(name.toLowerCase())) },
  ]
  const passed = checks.filter((c) => c.ok).length
  const score = Math.min(4, Math.floor((passed / checks.length) * 4) + (password.length >= 14 ? 1 : 0))
  return { checks, score: Math.min(score, 4), valid: checks.every((c) => c.ok) }
}
