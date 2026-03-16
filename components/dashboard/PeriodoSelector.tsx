'use client'

export type Periodo = 'semana' | 'mes' | '6m'

export const PERIODO_LABELS: Record<Periodo, string> = {
  semana: 'Última semana', mes: 'Mes en curso', '6m': '6 meses',
}

interface PeriodoSelectorProps {
  value:    Periodo
  onChange: (p: Periodo) => void
}

export function PeriodoSelector({ value, onChange }: PeriodoSelectorProps) {
  return (
    <div style={{
      display: 'flex', gap: '3px',
      background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)',
      borderRadius: '8px', padding: '3px',
    }}>
      {(['semana', 'mes', '6m'] as Periodo[]).map(p => (
        <button key={p} onClick={() => onChange(p)} style={{
          padding: '5px 13px', borderRadius: '5px', border: 'none',
          background: value === p ? 'rgba(245,130,10,0.18)' : 'transparent',
          color: value === p ? '#f5820a' : 'rgba(255,255,255,0.38)',
          fontFamily: 'var(--font-display)', fontSize: '0.58rem',
          letterSpacing: '0.12em', textTransform: 'uppercase',
          cursor: 'pointer', transition: 'all 0.15s', whiteSpace: 'nowrap',
        }}>{PERIODO_LABELS[p]}</button>
      ))}
    </div>
  )
}
