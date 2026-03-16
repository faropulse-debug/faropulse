'use client'

const AMBER     = '#f5820a'
const AMBER_DIM = 'rgba(245,130,10,0.15)'
const GREEN     = '#22c55e'
const RED       = '#ef4444'

export type ZoneStatus =
  | 'idle'
  | 'reading'
  | 'validating'
  | 'duplicate_check'
  | 'preview'
  | 'duplicate_warning'
  | 'inserting'
  | 'success'
  | 'error'

const STATUS_MAP: Record<ZoneStatus, { label: string; color: string; bg: string }> = {
  idle:              { label: 'Esperando archivo',    color: 'rgba(255,255,255,0.3)',   bg: 'rgba(255,255,255,0.05)' },
  reading:           { label: 'Leyendo…',              color: AMBER,                    bg: AMBER_DIM },
  validating:        { label: 'Validando…',            color: AMBER,                    bg: AMBER_DIM },
  duplicate_check:   { label: 'Verificando…',          color: AMBER,                    bg: AMBER_DIM },
  preview:           { label: 'Listo para cargar',     color: GREEN,                    bg: 'rgba(34,197,94,0.1)' },
  duplicate_warning: { label: 'Duplicados detectados', color: '#f59e0b',                bg: 'rgba(245,158,11,0.1)' },
  inserting:         { label: 'Insertando…',           color: AMBER,                    bg: AMBER_DIM },
  success:           { label: 'Carga exitosa',         color: GREEN,                    bg: 'rgba(34,197,94,0.1)' },
  error:             { label: 'Error',                 color: RED,                      bg: 'rgba(239,68,68,0.1)' },
}

export function StatusBadge({ status }: { status: ZoneStatus }) {
  const s = STATUS_MAP[status]
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '5px',
      fontFamily: 'var(--font-display)', fontSize: '0.58rem', letterSpacing: '0.15em',
      textTransform: 'uppercase', color: s.color, background: s.bg,
      border: `1px solid ${s.color}40`, borderRadius: '5px', padding: '3px 8px',
    }}>{s.label}</span>
  )
}
