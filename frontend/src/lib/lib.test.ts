import { describe, expect, it } from 'vitest'
import { checkPassword } from '@/lib/password'
import { addDays, minutes, money, setCurrency, toDateStr, toDateTimeLocal } from '@/lib/format'

describe('checkPassword', () => {
  it('flags every missing requirement', () => {
    const r = checkPassword('abc')
    expect(r.valid).toBe(false)
    expect(r.checks.filter((c) => !c.ok).length).toBeGreaterThanOrEqual(4)
  })
  it('accepts a strong password and rejects ones containing the email name', () => {
    expect(checkPassword('Sunrise!Pass12345', 'jo@x.com').valid).toBe(true)
    expect(checkPassword('Johnsmith!12345', 'johnsmith@x.com').valid).toBe(false)
  })
})

describe('date and number helpers', () => {
  it('uses local calendar dates without UTC shifting', () => {
    expect(toDateStr(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05')
    expect(toDateTimeLocal(new Date(2026, 0, 5, 7, 3))).toBe('2026-01-05T07:03')
  })
  it('adds days across month and year boundaries', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01')
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31')
  })
  it('formats durations and money', () => {
    expect(minutes(45)).toBe('45 min')
    expect(minutes(135)).toBe('2 h 15 min')
    setCurrency('USD')
    expect(money(12.5)).toContain('12.50')
  })
})
