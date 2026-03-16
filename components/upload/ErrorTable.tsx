'use client'

import type { ValidationError } from '@/lib/validators/uploadValidator'

const AMBER = '#f5820a'
const RED   = '#ef4444'

interface ErrorTableProps {
  errors:   ValidationError[]
  warnings: string[]
}

export function ErrorTable({ errors, warnings }: ErrorTableProps) {
  return (
    <div style={{ marginTop: '12px' }}>
      {warnings.map((w, i) => (
        <div key={i} style={{
          display: 'flex', gap: '8px', alignItems: 'flex-start',
          background: 'rgba(245,130,10,0.08)', borderLeft: `2px solid ${AMBER}`,
          borderRadius: '0 6px 6px 0', padding: '8px 12px', marginBottom: '6px',
          fontFamily: 'var(--font-body)', fontSize: '0.75rem', color: 'rgba(255,255,255,0.6)',
        }}>
          <span style={{ color: AMBER, fontWeight: 600, flexShrink: 0 }}>⚠</span>
          <span>{w}</span>
        </div>
      ))}
      {errors.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.72rem', fontFamily: 'var(--font-body)' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                {['Fila', 'Columna', 'Valor encontrado', 'Valor esperado'].map(h => (
                  <th key={h} style={{ padding: '6px 10px', textAlign: 'left', color: 'rgba(255,255,255,0.35)', fontWeight: 500, whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {errors.map((e, i) => (
                <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <td style={{ padding: '5px 10px', color: 'rgba(255,255,255,0.5)' }}>{e.row}</td>
                  <td style={{ padding: '5px 10px', color: AMBER, fontFamily: 'monospace' }}>{e.column}</td>
                  <td style={{ padding: '5px 10px', color: RED }}>{e.found || '(vacío)'}</td>
                  <td style={{ padding: '5px 10px', color: 'rgba(255,255,255,0.5)' }}>{e.expected}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
