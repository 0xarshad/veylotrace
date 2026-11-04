import { useEffect, useState } from 'react'

export type ThemePref = 'light' | 'dark' | 'system'

export function applyTheme(pref: ThemePref) {
  const dark = pref === 'dark' || (pref === 'system' && matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.classList.toggle('dark', dark)
  try {
    localStorage.setItem('vt-theme', pref) // a non-sensitive UI preference only
  } catch {
    /* storage unavailable */
  }
}

export function useTheme(): [ThemePref, (t: ThemePref) => void] {
  const [pref, setPref] = useState<ThemePref>(() => (localStorage.getItem('vt-theme') as ThemePref) || 'system')
  useEffect(() => {
    applyTheme(pref)
    if (pref !== 'system') return
    const mq = matchMedia('(prefers-color-scheme: dark)')
    const on = () => applyTheme('system')
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [pref])
  return [pref, setPref]
}
