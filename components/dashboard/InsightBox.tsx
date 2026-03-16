'use client'

interface InsightBoxProps {
  text: string
  type?: 'info' | 'warning' | 'positive'
}

export function InsightBox({ text, type = 'info' }: InsightBoxProps) {
  const colors = { info: '#f5820a', warning: '#f59e0b', positive: '#22c55e' }
  const c = colors[type]
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: '10px',
      background: `rgba(${type === 'info' ? '245,130,10' : type === 'warning' ? '245,158,11' : '34,197,94'},0.06)`,
      borderLeft: `2px solid ${c}`,
      borderRadius: '0 8px 8px 0', padding: '10px 14px',
    }}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0, marginTop: '1px' }}>
        <path d="M9 18h6M10 22h4M12 2a7 7 0 017 7c0 2.5-1.3 4.7-3.3 6L15 17H9l-.7-2C6.3 13.7 5 11.5 5 9a7 7 0 017-7z"
          stroke={c} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span style={{
        fontFamily: 'var(--font-body)', fontSize: '0.78rem',
        color: 'rgba(255,255,255,0.55)', lineHeight: 1.5,
      }}>{text}</span>
    </div>
  )
}
