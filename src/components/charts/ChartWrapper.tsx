'use client'
import { useRef, useState, useEffect, type ReactNode } from 'react'

interface Props {
  height: number
  children: ReactNode
}

/**
 * Delays mounting Recharts children until the container has a positive width.
 * Prevents the "width(-1) height(-1)" warning when tabs are hidden or remounted.
 */
export function ChartWrapper({ height, children }: Props) {
  const ref   = useRef<HTMLDivElement>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (el.offsetWidth > 0) { setReady(true); return }

    const ro = new ResizeObserver(([entry]) => {
      if (entry.contentRect.width > 0) { setReady(true); ro.disconnect() }
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  return (
    <div ref={ref} style={{ width: '100%', height }}>
      {ready && children}
    </div>
  )
}
