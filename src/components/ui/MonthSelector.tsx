'use client'

const MONTH_LABELS: Record<string, string> = {
  '01': 'Ene', '02': 'Feb', '03': 'Mar', '04': 'Abr',
  '05': 'May', '06': 'Jun', '07': 'Jul', '08': 'Ago',
  '09': 'Sep', '10': 'Oct', '11': 'Nov', '12': 'Dic',
}

export function fmtMesChip(ym: string): string {
  if (!ym) return '—'
  const [y, m] = ym.split('-')
  return `${MONTH_LABELS[m] || m} ${y.slice(2)}`
}

/** Returns today's YYYY-MM string. */
export function currentYM(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

const AMBER = '#f5820a'

interface Props {
  months:   string[]       // sorted descending: most-recent first
  selected: string | null
  onChange: (month: string) => void
}

export function MonthSelector({ months, selected, onChange }: Props) {
  if (!months.length) return null
  return (
    <div
      className="flex gap-2 mb-4 overflow-x-auto pb-1"
      style={{ scrollbarWidth: 'none' }}
    >
      {months.map(m => (
        <button
          key={m}
          onClick={() => onChange(m)}
          className="px-3 py-1 rounded-lg text-xs font-bold tracking-wide border transition-all flex-shrink-0"
          style={{
            background:  m === selected ? 'rgba(245,130,10,0.15)' : 'rgba(255,255,255,0.03)',
            borderColor: m === selected ? 'rgba(245,130,10,0.4)'  : 'rgba(255,255,255,0.08)',
            color:       m === selected ? AMBER                   : 'rgba(255,255,255,0.35)',
            cursor: 'pointer',
          }}
        >
          {fmtMesChip(m)}
        </button>
      ))}
    </div>
  )
}
