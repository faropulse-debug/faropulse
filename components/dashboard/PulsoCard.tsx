'use client'

const AMBER = '#f5820a'

interface PulsoCardProps {
  label:           string
  value:           string
  vsAnterior:      number
  subtitle?:       string
  tbd?:            boolean
  accentOverride?: string
}

export function PulsoCard({ label, value, vsAnterior, subtitle, tbd, accentOverride }: PulsoCardProps) {
  const isUp        = vsAnterior >= 0
  const accentColor = accentOverride ?? (isUp ? '#22c55e' : '#ef4444')
  return (
    <div style={{
      position: 'relative',
      background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)',
      borderRadius: '16px', backdropFilter: 'blur(20px)',
      padding: '22px 20px 18px', overflow: 'hidden',
    }}>
      <div style={{
        position: 'absolute', top: 0, left: '15%', right: '15%', height: '1px',
        background: `linear-gradient(90deg, transparent, ${accentColor}55, transparent)`,
      }} />
      <div style={{
        fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: '0.6rem',
        letterSpacing: '0.18em', textTransform: 'uppercase',
        color: 'rgba(255,255,255,0.38)', marginBottom: '14px',
      }}>{label}</div>

      {tbd ? (
        <div style={{ marginBottom: '12px' }}>
          <span style={{
            display: 'inline-block',
            fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.72rem',
            letterSpacing: '0.18em', textTransform: 'uppercase',
            color: AMBER, background: 'rgba(245,130,10,0.12)',
            border: '1px solid rgba(245,130,10,0.3)',
            borderRadius: '6px', padding: '4px 10px',
          }}>TBD</span>
        </div>
      ) : (
        <div style={{
          fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: '1.65rem',
          lineHeight: 1, color: 'rgba(255,255,255,0.92)', letterSpacing: '-0.02em', marginBottom: '12px',
        }}>{value}</div>
      )}

      {!tbd && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: '5px',
          fontFamily: 'var(--font-body)', fontSize: '0.72rem', color: accentColor,
          marginBottom: subtitle ? '6px' : 0,
        }}>
          <span>{isUp ? '▲' : '▼'}</span>
          <span style={{ fontWeight: 600 }}>{Math.abs(vsAnterior).toFixed(1)}%</span>
          <span style={{ color: 'rgba(255,255,255,0.28)', fontSize: '0.65rem' }}>vs período ant.</span>
        </div>
      )}

      {subtitle && (
        <div style={{
          fontFamily: 'var(--font-body)', fontSize: '0.63rem',
          color: 'rgba(255,255,255,0.25)', letterSpacing: '0.04em',
          marginTop: tbd ? '6px' : 0,
        }}>{subtitle}</div>
      )}
    </div>
  )
}
