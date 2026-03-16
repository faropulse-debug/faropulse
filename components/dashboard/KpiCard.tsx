'use client'

import { fmtPeso } from '@/lib/format'
import { Sparkline } from './Sparkline'

export type SemColor = 'green' | 'yellow' | 'red'

const SEM_COLORS: Record<SemColor, string> = {
  green: '#22c55e', yellow: '#f59e0b', red: '#ef4444',
}
const SEM_GLOW: Record<SemColor, string> = {
  green: 'rgba(34,197,94,0.18)', yellow: 'rgba(245,158,11,0.18)', red: 'rgba(239,68,68,0.18)',
}

function delta(curr: number, prev: number) {
  const d = curr - prev
  return { d, sign: d > 0 ? '+' : '' }
}

export interface KpiCardProps {
  label:         string
  unit:          string
  value:         string
  prevValue:     number
  currValue:     number
  sem:           SemColor
  sparkValues:   number[]
  formatDelta?:  (d: number) => string
}

export function KpiCard({ label, unit, value, prevValue, currValue, sem, sparkValues, formatDelta }: KpiCardProps) {
  const { d, sign } = delta(currValue, prevValue)
  const semColor    = SEM_COLORS[sem]
  const semGlow     = SEM_GLOW[sem]
  const dStr        = formatDelta ? formatDelta(Math.abs(d)) : (Math.abs(d) < 1 ? Math.abs(d).toFixed(1) + '%' : fmtPeso(Math.abs(d)))
  const isUp        = d >= 0
  return (
    <div style={{
      position: 'relative',
      background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)',
      borderRadius: '16px', backdropFilter: 'blur(20px)',
      padding: '22px 20px 18px', display: 'flex', flexDirection: 'column', gap: '12px',
      boxShadow: `0 0 20px ${semGlow}`, overflow: 'hidden',
    }}>
      <div style={{
        position: 'absolute', top: 0, left: '15%', right: '15%', height: '1px',
        background: `linear-gradient(90deg, transparent, ${semColor}66, transparent)`,
      }} />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{
          fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: '0.6rem',
          letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)',
        }}>{label}</span>
        <div style={{
          width: '10px', height: '10px', borderRadius: '50%', background: semColor,
          boxShadow: `0 0 8px ${semColor}, 0 0 16px ${semColor}55`,
        }} />
      </div>
      <div style={{
        fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: '1.75rem',
        lineHeight: 1, color: 'rgba(255,255,255,0.92)', letterSpacing: '-0.02em',
      }}>{value}</div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{
          fontFamily: 'var(--font-body)', fontSize: '0.72rem',
          color: isUp ? '#22c55e' : '#ef4444', display: 'flex', alignItems: 'center', gap: '3px',
        }}>
          <span style={{ fontSize: '0.85rem' }}>{isUp ? '↑' : '↓'}</span>
          {sign}{dStr}
        </span>
        <Sparkline values={sparkValues} color={semColor} />
      </div>
      <div style={{
        fontFamily: 'var(--font-body)', fontSize: '0.63rem',
        color: 'rgba(255,255,255,0.28)', textTransform: 'uppercase', letterSpacing: '0.12em',
      }}>{unit}</div>
    </div>
  )
}
