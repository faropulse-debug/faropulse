'use client'

const AMBER = '#f5820a'

interface CustomTooltipProps {
  active?:    boolean
  payload?:   Array<{ value: number; name: string; color?: string }>
  label?:     string
  formatter?: (value: number, name: string) => string
}

export function CustomTooltip({ active, payload, label, formatter }: CustomTooltipProps) {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background: 'rgba(10,12,15,0.96)', border: '1px solid rgba(245,130,10,0.35)',
      borderRadius: '10px', padding: '10px 14px',
      fontFamily: 'var(--font-body)', fontSize: '12px', color: 'rgba(255,255,255,0.85)',
    }}>
      <div style={{ color: AMBER, fontFamily: 'var(--font-display)', letterSpacing: '0.1em', marginBottom: '6px', fontSize: '11px' }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '2px' }}>
          <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: p.color || AMBER }} />
          <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '11px' }}>{p.name}:</span>
          <span style={{ fontWeight: 600 }}>{formatter ? formatter(p.value, p.name) : p.value}</span>
        </div>
      ))}
    </div>
  )
}
