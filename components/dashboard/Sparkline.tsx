'use client'

interface SparklineProps {
  values: number[]
  color:  string
}

export function Sparkline({ values, color }: SparklineProps) {
  const min   = Math.min(...values)
  const max   = Math.max(...values)
  const range = max - min || 1
  const W = 64, H = 24, PAD = 2
  const pts = values.map((v, i) => {
    const x = PAD + (i / (values.length - 1)) * (W - PAD * 2)
    const y = H - PAD - ((v - min) / range) * (H - PAD * 2)
    return `${x},${y}`
  })
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: 'block' }}>
      <polyline points={pts.join(' ')} fill="none" stroke={color} strokeWidth="1.5"
        strokeLinecap="round" strokeLinejoin="round" opacity={0.8} />
      {pts.map((p, i) => {
        const [x, y] = p.split(',').map(Number)
        return <circle key={i} cx={x} cy={y} r={i === pts.length - 1 ? 2.5 : 1.5}
          fill={color} opacity={i === pts.length - 1 ? 1 : 0.5} />
      })}
    </svg>
  )
}
