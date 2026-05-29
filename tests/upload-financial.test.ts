import { describe, it, expect, vi, afterEach } from 'vitest'
import { parsePeriodoLabel } from '@/app/api/upload/financial/route'

describe('parsePeriodoLabel — 2-digit year (m1 pattern)', () => {
  afterEach(() => { vi.restoreAllMocks() })

  it('"Ene 26" → "2026-01"', () => {
    expect(parsePeriodoLabel('Ene 26')).toBe('2026-01')
  })
  it('"Dic-25" → "2025-12" (dash separator)', () => {
    expect(parsePeriodoLabel('Dic-25')).toBe('2025-12')
  })
  it('"Feb25" → "2025-02" (no separator)', () => {
    expect(parsePeriodoLabel('Feb25')).toBe('2025-02')
  })
  it('"Ago 30" → "2030-08" (in-range, no warning)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(parsePeriodoLabel('Ago 30')).toBe('2030-08')
    expect(warn).not.toHaveBeenCalled()
  })
  it('"Ene 99" → "2099-01" + warning (suspicious year outside 2015–2040)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(parsePeriodoLabel('Ene 99')).toBe('2099-01')
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('2099'))
  })
})

describe('parsePeriodoLabel — 4-digit year formats (unchanged)', () => {
  it('"2025-06" → "2025-06" (YYYY-MM passthrough)', () => {
    expect(parsePeriodoLabel('2025-06')).toBe('2025-06')
  })
  it('"Enero 2025" → "2025-01" (full month name)', () => {
    expect(parsePeriodoLabel('Enero 2025')).toBe('2025-01')
  })
  it('"01/2025" → "2025-01" (numeric month/year)', () => {
    expect(parsePeriodoLabel('01/2025')).toBe('2025-01')
  })
})

describe('parsePeriodoLabel — null cases', () => {
  it('"not-a-date" → null', () => {
    expect(parsePeriodoLabel('not-a-date')).toBeNull()
  })
  it('"" → null', () => {
    expect(parsePeriodoLabel('')).toBeNull()
  })
})
