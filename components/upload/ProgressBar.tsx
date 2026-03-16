'use client'

const AMBER = '#f5820a'

export function ProgressBar({ pct }: { pct: number }) {
  return (
    <div style={{ width: '100%', height: '4px', background: 'rgba(255,255,255,0.08)', borderRadius: '2px', overflow: 'hidden' }}>
      <div style={{
        height: '100%', borderRadius: '2px',
        background: `linear-gradient(90deg, ${AMBER}, #fba94c)`,
        width: `${Math.min(100, pct)}%`,
        transition: 'width 0.3s ease',
        boxShadow: `0 0 8px rgba(245,130,10,0.5)`,
      }} />
    </div>
  )
}
