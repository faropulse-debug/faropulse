'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { SectionLabel }      from '@/components/dashboard/SectionLabel'
import MixCanalesChart       from '../../charts/MixCanalesChart'
import { currentYM }         from '@/src/components/ui/MonthSelector'
import {
  availableMonthsFromCanalRows,
  type VentasPorCanalRow, type VentasPorCanalSemanaRow, type VentasPorCanalDiaRow,
} from '@/src/lib/canal-chart-helpers'
import { getSupabase } from '@/lib/supabase'

// Survive tab remounts. Keyed por locationId (mensual/semanal) o
// `locationId|mes` (diario, un fetch por mes visitado).
const monthlyCache = new Map<string, VentasPorCanalRow[]>()
const weeklyCache  = new Map<string, VentasPorCanalSemanaRow[]>()
const dailyCache   = new Map<string, VentasPorCanalDiaRow[]>()

interface Props {
  locationId: string
}

export function MixCanalesSection({ locationId }: Props) {
  const cachedMonthly = monthlyCache.get(locationId)

  const [monthly,        setMonthly]        = useState<VentasPorCanalRow[]>(cachedMonthly ?? [])
  const [weekly,          setWeekly]         = useState<VentasPorCanalSemanaRow[]>(weeklyCache.get(locationId) ?? [])
  const [selectedMonth,   setSelectedMonth]  = useState<string>('')
  // Resultado del último fetch (mes no cacheado). El valor mostrado en cache-hit
  // se deriva directo de dailyCache durante el render — ver `daily` más abajo.
  const [fetchedDaily,    setFetchedDaily]   = useState<{ key: string; rows: VentasPorCanalDiaRow[] } | null>(null)
  const [isLoading,       setIsLoading]      = useState(!cachedMonthly)
  const [isRefreshing,    setIsRefreshing]   = useState(false)
  const [isDailyLoading,  setIsDailyLoading] = useState(false)
  // True once este mount tiene datos base (cache o primer fetch).
  const hasDataRef = useRef(!!cachedMonthly)

  const months = useMemo(() => availableMonthsFromCanalRows(monthly), [monthly])

  // Mes activo de la pestaña Diario: último mes cerrado (no el parcial actual),
  // salvo que el usuario haya elegido explícitamente otro mes disponible.
  const activeDailyMonth = useMemo(() => {
    const todayYM = currentYM()
    const closed  = months.find(m => m < todayYM)
    const def     = closed ?? months[0] ?? ''
    return (selectedMonth && months.includes(selectedMonth)) ? selectedMonth : def
  }, [months, selectedMonth])

  // Mensual + semanal: independientes del mes seleccionado, se piden una vez.
  const loadBase = useCallback(async () => {
    if (!locationId) return
    if (hasDataRef.current) setIsRefreshing(true)
    else setIsLoading(true)

    const supabase = getSupabase()
    const [monthlyRes, weeklyRes] = await Promise.all([
      supabase.rpc('get_ventas_por_canal',        { p_location_id: locationId }),
      supabase.rpc('get_ventas_por_canal_semana', { p_location_id: locationId }),
    ])
    if (monthlyRes.error) console.error('[MixCanalesSection] get_ventas_por_canal', monthlyRes.error.message)
    if (weeklyRes.error)  console.error('[MixCanalesSection] get_ventas_por_canal_semana', weeklyRes.error.message)

    const monthlyResult = (monthlyRes.data ?? []) as VentasPorCanalRow[]
    const weeklyResult  = (weeklyRes.data  ?? []) as VentasPorCanalSemanaRow[]
    monthlyCache.set(locationId, monthlyResult)
    weeklyCache.set(locationId, weeklyResult)
    setMonthly(monthlyResult)
    setWeekly(weeklyResult)
    hasDataRef.current = true
    setIsLoading(false)
    setIsRefreshing(false)
  }, [locationId])

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { loadBase() }, [loadBase])

  const dailyCacheKey = locationId && activeDailyMonth ? `${locationId}|${activeDailyMonth}` : null
  const cachedDaily   = dailyCacheKey ? dailyCache.get(dailyCacheKey) : undefined
  // Cache-hit: leído directo del Map durante el render, sin pasar por setState.
  // Cache-miss: sigue en `[]` hasta que el fetch de abajo resuelva (mismo gap
  // que antes, cubierto por el skeleton de isDailyLoading — MixCanalesChart
  // nunca pinta `daily` mientras isDailyLoading es true).
  const daily = cachedDaily ?? (fetchedDaily?.key === dailyCacheKey ? fetchedDaily.rows : [])

  // Diario: un fetch por mes visitado, cacheado por `locationId|mes`.
  useEffect(() => {
    if (!dailyCacheKey || dailyCache.has(dailyCacheKey)) return

    let cancelled = false
    // Igual que loadBase arriba: dispara el fetch, no ajusta estado derivado
    // de una prop — el flag de loading que arranca antes de un fetch async.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsDailyLoading(true)
    getSupabase()
      .rpc('get_ventas_por_canal_dia', { p_location_id: locationId, p_mes: activeDailyMonth })
      .then(({ data, error }: { data: unknown; error: { message: string } | null }) => {
        if (cancelled) return
        if (error) console.error('[MixCanalesSection] get_ventas_por_canal_dia', error.message)
        const result = (data ?? []) as VentasPorCanalDiaRow[]
        dailyCache.set(dailyCacheKey, result)
        setFetchedDaily({ key: dailyCacheKey, rows: result })
        setIsDailyLoading(false)
      })
    return () => { cancelled = true }
  }, [locationId, activeDailyMonth, dailyCacheKey])

  return (
    <div style={{ marginBottom: '52px' }}>
      <SectionLabel>Mix de Canales</SectionLabel>
      <div style={{ opacity: isRefreshing ? 0.6 : 1, transition: 'opacity 0.3s' }}>
        <MixCanalesChart
          monthly={monthly}
          weekly={weekly}
          daily={daily}
          activeDailyMonth={activeDailyMonth}
          onSelectMonth={setSelectedMonth}
          isLoading={isLoading}
          isDailyLoading={isDailyLoading}
        />
      </div>
    </div>
  )
}
