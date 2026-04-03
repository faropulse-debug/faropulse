import { fmtMillones, fmtPct } from '@/lib/format'

// ─── Color tokens ─────────────────────────────────────────────────────────────

export const BG_CARD    = '#111114'
export const BORDER     = 'rgba(255,255,255,0.07)'
export const GREEN      = '#10B981'
export const RED        = '#EF4444'
export const AMBER      = '#F59E0B'
export const TRACK      = '#1F1F26'
export const MUTED      = 'rgba(255,255,255,0.35)'

// ─── Typography tokens ────────────────────────────────────────────────────────

export const FONT_VALUE = "var(--font-syne), sans-serif"
export const FONT_LABEL = "var(--font-dm-mono), monospace"

// ─── Glow map ─────────────────────────────────────────────────────────────────

export const GLOW_MAP: Record<string, string> = {
  [GREEN]: 'rgba(16,185,129,0.12)',
  [RED]:   'rgba(239,68,68,0.12)',
  [AMBER]: 'rgba(245,158,11,0.12)',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function semColor(pct: number | null): string {
  if (pct === null) return AMBER
  if (pct > 0)      return GREEN
  if (pct < 0)      return RED
  return AMBER
}

export function arrow(pct: number | null): string {
  if (pct === null || pct === 0) return '▶'
  return pct > 0 ? '▲' : '▼'
}

/** Formats a nullable number as millones (e.g. 1.2M). Returns '—' for null. */
export function fmtValue(v: number | null): string {
  return v === null ? '—' : fmtMillones(v)
}

/** Formats a nullable percentage with sign (e.g. +12.3%). Returns '—' for null. */
export function fmtPctSigned(v: number | null): string {
  if (v === null) return '—'
  return `${v > 0 ? '+' : ''}${fmtPct(v)}`
}
