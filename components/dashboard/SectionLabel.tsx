'use client'

interface SectionLabelProps {
  children: React.ReactNode
  action?:  React.ReactNode
}

export function SectionLabel({ children, action }: SectionLabelProps) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
      <span style={{
        fontFamily: 'var(--font-display)', fontSize: '0.6rem', letterSpacing: '0.25em',
        textTransform: 'uppercase', color: 'rgba(255,255,255,0.22)', whiteSpace: 'nowrap',
      }}>{children}</span>
      {action}
      <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.05)' }} />
    </div>
  )
}
