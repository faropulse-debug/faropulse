'use client'

interface PreviewTableProps {
  rows:    Record<string, unknown>[]
  headers: string[]
}

export function PreviewTable({ rows, headers }: PreviewTableProps) {
  const preview = rows.slice(0, 5)
  const cols    = headers.slice(0, 8)
  return (
    <div style={{ overflowX: 'auto', marginTop: '12px' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.7rem', fontFamily: 'var(--font-body)' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
            {cols.map(h => (
              <th key={h} style={{ padding: '5px 8px', textAlign: 'left', color: 'rgba(255,255,255,0.4)', fontWeight: 500, whiteSpace: 'nowrap', fontFamily: 'var(--font-display)', fontSize: '0.6rem', letterSpacing: '0.1em' }}>{h}</th>
            ))}
            {headers.length > 8 && <th style={{ padding: '5px 8px', color: 'rgba(255,255,255,0.25)', fontSize: '0.6rem' }}>+{headers.length - 8} más</th>}
          </tr>
        </thead>
        <tbody>
          {preview.map((row, i) => (
            <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
              {cols.map(h => (
                <td key={h} style={{ padding: '4px 8px', color: 'rgba(255,255,255,0.55)', whiteSpace: 'nowrap', maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {String(row[h] ?? '')}
                </td>
              ))}
              {headers.length > 8 && <td />}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
