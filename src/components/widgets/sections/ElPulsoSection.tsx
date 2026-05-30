'use client'

import { useState, useMemo } from 'react'
import { useDashboardData }                from '@/hooks/useDashboardData'
import { SectionLabel }                    from '@/components/dashboard/SectionLabel'
import { PulsoCard }                       from '@/components/dashboard/PulsoCard'
import { PeriodoSelector, PERIODO_LABELS } from '@/components/dashboard/PeriodoSelector'
import { fmtMillones, fmtPeso }            from '@/lib/format'
import type { Periodo }                    from '@/components/dashboard/PeriodoSelector'

// ─── Types ────────────────────────────────────────────────────────────────────

interface PulsoDatos {
  ventas:           number
  resultadoNeto:    number | null
  tickets:          number
  comensalesTotal:  number
  ticketProm:       number
  ticketPorPersona: number | null
  vsAnterior:       { ventas: number; tickets: number }
}

// ─── Empty fallback (loading / no data) ──────────────────────────────────────

const EMPTY: Record<Periodo, PulsoDatos> = {
  semana: { ventas: 0, resultadoNeto: null, tickets: 0, comensalesTotal: 0, ticketProm: 0, ticketPorPersona: null, vsAnterior: { ventas: 0, tickets: 0 } },
  mes:    { ventas: 0, resultadoNeto: null, tickets: 0, comensalesTotal: 0, ticketProm: 0, ticketPorPersona: null, vsAnterior: { ventas: 0, tickets: 0 } },
  '6m':   { ventas: 0, resultadoNeto: null, tickets: 0, comensalesTotal: 0, ticketProm: 0, ticketPorPersona: null, vsAnterior: { ventas: 0, tickets: 0 } },
}

const AMBER = '#f5820a'

// ─── Date range helpers ───────────────────────────────────────────────────────

function pad(n: number) { return String(n).padStart(2, '0') }

function dateRangeLabel(periodo: Periodo): string {
  const now   = new Date()
  const day   = now.getDate()
  const month = now.getMonth()      // 0-based
  const year  = now.getFullYear()

  if (periodo === 'semana') {
    // Monday of the current ISO week
    const dow     = now.getDay() === 0 ? 7 : now.getDay() // Sun=7
    const mon     = new Date(now)
    mon.setDate(day - (dow - 1))
    const sun     = new Date(mon)
    sun.setDate(mon.getDate() + 6)
    const fmt = (d: Date) => `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`
    return `Lun ${fmt(mon)} - Dom ${fmt(sun)}`
  }

  if (periodo === 'mes') {
    const last = new Date(year, month + 1, 0).getDate()  // last day of month
    return `01/${pad(month + 1)}/${year} - ${pad(last)}/${pad(month + 1)}/${year}`
  }

  // 6m: from 6 months ago (first day) to current month
  const start = new Date(year, month - 5, 1)
  const sm    = pad(start.getMonth() + 1)
  const sy    = start.getFullYear()
  return `${sm}/${sy} - ${pad(month + 1)}/${year}`
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  locationId: string
}

export function ElPulsoSection({ locationId }: Props) {
  const [periodo, setPeriodo] = useState<Periodo>('mes')
  const { data: liveData, isLoading } = useDashboardData(locationId)

  const datosPorPeriodo = useMemo((): Record<Periodo, PulsoDatos> => {
    // A2: no data yet (loading / error) → honest zeros, not pizzería mock
    if (!liveData) return EMPTY

    const pct = (a: number, b: number) => b > 0 ? ((a - b) / b) * 100 : 0
    const n   = (v: number | string) => Number(v)

    const semV = liveData.ventasDiarias.reduce((s, d) => s + n(d.ventas), 0)
    const semT = liveData.ventasDiarias.reduce((s, d) => s + n(d.tickets), 0)
    const semC = liveData.ventasDiarias.reduce((s, d) => s + n(d.comensales), 0)

    // A3: real vsAnterior from weekly series — last ISO week vs the one before it
    const semAct  = liveData.ventasSemanales.at(-1)
    const semPrev = liveData.ventasSemanales.at(-2)

    const mes     = liveData.ventasMensuales.at(-1)
    const prevMes = liveData.ventasMensuales.at(-2)
    // A4: no current month data → 0, not 82M mock
    const mesV = mes     ? n(mes.ventas)     : 0
    const mesT = mes     ? n(mes.tickets)    : 0
    const mesC = mes     ? n(mes.comensales) : 0
    const prevMesV = prevMes ? n(prevMes.ventas)  : 0
    const prevMesT = prevMes ? n(prevMes.tickets) : 0

    const s6V = liveData.ventasMensuales.reduce((s, d) => s + n(d.ventas), 0)
    const s6T = liveData.ventasMensuales.reduce((s, d) => s + n(d.tickets), 0)
    const s6C = liveData.ventasMensuales.reduce((s, d) => s + n(d.comensales), 0)
    const half        = Math.floor(liveData.ventasMensuales.length / 2)
    const secondHalfV = liveData.ventasMensuales.slice(half).reduce((s, d) => s + n(d.ventas), 0)
    const firstHalfV  = liveData.ventasMensuales.slice(0, half).reduce((s, d) => s + n(d.ventas), 0)
    const secondHalfT = liveData.ventasMensuales.slice(half).reduce((s, d) => s + n(d.tickets), 0)
    const firstHalfT  = liveData.ventasMensuales.slice(0, half).reduce((s, d) => s + n(d.tickets), 0)

    return {
      semana: {
        ventas:           semV,
        resultadoNeto:    null,
        tickets:          semT,
        comensalesTotal:  semC,
        ticketProm:       semT > 0 ? semV / semT : 0,
        ticketPorPersona: semC > 0 ? semV / semC : null,
        // A3: real weekly delta; 0 if only one week of history available
        vsAnterior: {
          ventas:  semAct && semPrev ? pct(n(semAct.ventas),  n(semPrev.ventas))  : 0,
          tickets: semAct && semPrev ? pct(n(semAct.tickets), n(semPrev.tickets)) : 0,
        },
      },
      mes: {
        ventas:           mesV,
        resultadoNeto:    null,
        tickets:          mesT,
        comensalesTotal:  mesC,
        ticketProm:       mesT > 0 ? mesV / mesT : 0,
        ticketPorPersona: mesC > 0 ? mesV / mesC : null,
        vsAnterior: {
          // A5: no previous month → 0, not mock
          ventas:  prevMesV > 0 ? pct(mesV, prevMesV) : 0,
          tickets: prevMesT > 0 ? pct(mesT, prevMesT) : 0,
        },
      },
      '6m': {
        ventas:           s6V,
        resultadoNeto:    null,
        tickets:          s6T,
        comensalesTotal:  s6C,
        ticketProm:       s6T > 0 ? s6V / s6T : 0,
        ticketPorPersona: s6C > 0 ? s6V / s6C : null,
        vsAnterior: {
          // A6: insufficient history → 0, not mock
          ventas:  firstHalfV > 0 ? pct(secondHalfV, firstHalfV) : 0,
          tickets: firstHalfT > 0 ? pct(secondHalfT, firstHalfT) : 0,
        },
      },
    }
  }, [liveData])

  const datos = datosPorPeriodo[periodo]

  return (
    <div style={{ marginBottom: '52px' }}>
      <SectionLabel action={
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <PeriodoSelector value={periodo} onChange={setPeriodo} />
          <span style={{
            fontFamily: 'var(--font-dm-mono)', fontSize: '11px',
            color: 'rgba(255,255,255,0.3)', whiteSpace: 'nowrap',
          }}>{dateRangeLabel(periodo)}</span>
        </div>
      }>
        El Pulso —{' '}
        <span style={{ color: AMBER, marginLeft: '4px' }}>{PERIODO_LABELS[periodo]}</span>
      </SectionLabel>
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(188px, 1fr))', gap: '16px',
        opacity: isLoading ? 0.5 : 1, transition: 'opacity 0.3s',
      }}>
        <PulsoCard label="Ventas"            value={fmtMillones(datos.ventas)}                                           vsAnterior={datos.vsAnterior.ventas}  subtitle="Facturación del período" />
        <PulsoCard label="Resultado Neto"    value=""                                                                    vsAnterior={0}                        tbd={true} subtitle="Disponible al cargar P&L 2026" />
        <PulsoCard label="Tickets (docs.)"   value={datos.tickets.toLocaleString('es-AR')}                               vsAnterior={datos.vsAnterior.tickets} subtitle="Documentos facturados" />
        <PulsoCard label="Comensales Total"  value={datos.comensalesTotal.toLocaleString('es-AR')}                       vsAnterior={0}                        subtitle="Personas en el período" />
        <PulsoCard label="Ticket Promedio"   value={fmtPeso(Math.round(datos.ticketProm))}                               vsAnterior={0}                        subtitle="Facturación / documentos" />
        <PulsoCard label="Ticket por Persona" value={datos.ticketPorPersona ? fmtPeso(Math.round(datos.ticketPorPersona)) : '—'} vsAnterior={0}               subtitle="Facturación / personas" accentOverride={AMBER} />
      </div>
    </div>
  )
}
