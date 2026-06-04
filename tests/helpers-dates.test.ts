import { describe, it, expect } from 'vitest'
import { toDate, toTimestamp } from '@/src/lib/upload/helpers'

describe('toDate — Excel serial numbers', () => {
  it('parses serial 46167 → 2026-05-25', () => {
    expect(toDate(46167)).toBe('2026-05-25')
  })
  it('parses serial 46132 → 2026-04-20', () => {
    expect(toDate(46132)).toBe('2026-04-20')
  })
})

describe('toDate — no regression on text formats', () => {
  it('parses DD/MM/YYYY string', () => {
    expect(toDate('25/05/2026')).toBe('2026-05-25')
  })
  it('parses ISO string', () => {
    expect(toDate('2026-05-25')).toBe('2026-05-25')
  })
  it('returns null for null', () => {
    expect(toDate(null)).toBeNull()
  })
  it('returns null for empty string', () => {
    expect(toDate('')).toBeNull()
  })
})

describe('toTimestamp — Excel serial with fractional time', () => {
  it('parses serial 46167.5: valid ISO, year 2026, month May', () => {
    const ts = toTimestamp(46167.5)
    expect(ts).not.toBeNull()
    const d = new Date(ts!)
    expect(isNaN(d.getTime())).toBe(false)
    // 46167.5 = noon on 2026-05-25 local time; UTC year/month still 2026/April-May
    expect(d.getUTCFullYear()).toBe(2026)
    expect(d.getUTCMonth()).toBe(4) // May (0-indexed)
  })
  it('parses integer serial 46167: valid ISO string starting with 2026-05-25', () => {
    const ts = toTimestamp(46167)
    expect(ts).not.toBeNull()
    expect(ts).toMatch(/^2026-05-25T/)
  })
})

describe('toTimestamp — no regression on text formats', () => {
  it('parses DD/MM/YYYY string', () => {
    const ts = toTimestamp('25/05/2026')
    expect(ts).not.toBeNull()
    expect(ts).toMatch(/^2026-05-25T/)
  })
  it('parses DD/MM/YYYY with time', () => {
    const ts = toTimestamp('25/05/2026 14:30:00')
    expect(ts).not.toBeNull()
    expect(ts).toMatch(/^2026-05-25T/)
  })
  it('returns null for null', () => {
    expect(toTimestamp(null)).toBeNull()
  })
  it('returns null for empty string', () => {
    expect(toTimestamp('')).toBeNull()
  })
})
