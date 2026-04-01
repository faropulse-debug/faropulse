'use client'

// ─── Design tokens ────────────────────────────────────────────────────────────

const BG_CARD = '#111114'
const BORDER  = 'rgba(255,255,255,0.07)'

// ─── Types ────────────────────────────────────────────────────────────────────

interface SkeletonLine {
  width:  string
  height: string
}

interface WidgetSkeletonProps {
  /** Custom line shapes. Defaults to a 4-line card layout. */
  lines?: SkeletonLine[]
  /** Number of repeated skeleton blocks (e.g. for list widgets) */
  rows?: number
}

// ─── Defaults ─────────────────────────────────────────────────────────────────

const DEFAULT_LINES: SkeletonLine[] = [
  { width: '45%',  height: '10px' },
  { width: '70%',  height: '32px' },
  { width: '55%',  height: '12px' },
  { width: '100%', height: '10px' },
]

// ─── Single skeleton block ────────────────────────────────────────────────────

function SkeletonBlock({ lines }: { lines: SkeletonLine[] }) {
  return (
    <div style={{
      background:    BG_CARD,
      border:        `1px solid ${BORDER}`,
      borderRadius:  '14px',
      padding:       '20px 18px 18px',
      display:       'flex',
      flexDirection: 'column',
      gap:           '12px',
    }}>
      {lines.map((line, i) => (
        <div key={i} style={{
          width:        line.width,
          height:       line.height,
          borderRadius: '6px',
          background:   'rgba(255,255,255,0.06)',
          animation:    'widget-pulse 1.6s ease-in-out infinite',
        }} />
      ))}
      <style>{`
        @keyframes widget-pulse {
          0%, 100% { opacity: 0.4; }
          50%       { opacity: 0.9; }
        }
      `}</style>
    </div>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

export function WidgetSkeleton({ lines = DEFAULT_LINES, rows = 1 }: WidgetSkeletonProps) {
  return (
    <>
      {Array.from({ length: rows }, (_, i) => (
        <SkeletonBlock key={i} lines={lines} />
      ))}
    </>
  )
}
