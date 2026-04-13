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

// ─── Mock fallback ────────────────────────────────────────────────────────────

const MOCK: Record<Periodo, PulsoDatos> = {
  semana: {
    ventas: 19_800_000, resultadoNeto: null, tickets: 538,
    comensalesTotal: 1_526, ticketProm: 36_800, ticketPorPersona: 12_974,
    vsAnterior: { ventas: 8.2, tickets: 6.4 },
  },
  mes: {
    ventas: 82_100_000, resultadoNeto: null, tickets: 2_290,
    comensalesTotal: 6_780, ticketProm: 35_850, ticketPorPersona: 12_109,
    vsAnterior: { ventas: 57.0, tickets: 46.8 },
  },
  '6m': {
    ventas: 306_700_000, resultadoNeto: null, tickets: 9_870,
    comensalesTotal: 28_400, ticketProm: 31_075, ticketPorPersona: 10_800,
    vsAnterior: { ventas: 22.4, tickets: 19.2 },
  },
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
    if (!liveData) return MOCK

    const pct = (a: number, b: number) => b > 0 ? ((a - b) / b) * 100 : 0
    const n   = (v: number | string) => Number(v)

    const semV = liveData.ventasDiarias.reduce((s, d) => s + n(d.ventas), 0)
    const semT = liveData.ventasDiarias.reduce((s, d) => s + n(d.tickets), 0)
    const semC = liveData.ventasDiarias.reduce((s, d) => s + n(d.comensales), 0)

    const mes     = liveData.ventasMensuales.at(-1)
    const prevMes = liveData.ventasMensuales.at(-2)
    const mesV = mes     ? n(mes.ventas)     : MOCK.mes.ventas
    const mesT = mes     ? n(mes.tickets)    : MOCK.mes.tickets
    const mesC = mes     ? n(mes.comensales) : MOCK.mes.comensalesTotal
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
        ventas:           semV > 0 ? semV : MOCK.semana.ventas,
        resultadoNeto:    null,
        tickets:          semT > 0 ? semT : MOCK.semana.tickets,
        comensalesTotal:  semC,
        ticketProm:       semT > 0 ? semV / semT : MOCK.semana.ticketProm,
        ticketPorPersona: semC > 0 ? semV / semC : null,
        vsAnterior: { ventas: MOCK.semana.vsAnterior.ventas, tickets: MOCK.semana.vsAnterior.tickets },
      },
      mes: {
        ventas:           mesV,
        resultadoNeto:    null,
        tickets:          mesT,
        comensalesTotal:  mesC,
        ticketProm:       mesT > 0 ? mesV / mesT : MOCK.mes.ticketProm,
        ticketPorPersona: mesC > 0 ? mesV / mesC : null,
        vsAnterior: {
          ventas:  prevMesV > 0 ? pct(mesV, prevMesV) : MOCK.mes.vsAnterior.ventas,
          tickets: prevMesT > 0 ? pct(mesT, prevMesT) : MOCK.mes.vsAnterior.tickets,
        },
      },
      '6m': {
        ventas:           s6V > 0 ? s6V : MOCK['6m'].ventas,
        resultadoNeto:    null,
        tickets:          s6T > 0 ? s6T : MOCK['6m'].tickets,
        comensalesTotal:  s6C,
        ticketProm:       s6T > 0 ? s6V / s6T : MOCK['6m'].ticketProm,
        ticketPorPersona: s6C > 0 ? s6V / s6C : null,
        vsAnterior: {
          ventas:  firstHalfV > 0 ? pct(secondHalfV, firstHalfV) : MOCK['6m'].vsAnterior.ventas,
          tickets: firstHalfT > 0 ? pct(secondHalfT, firstHalfT) : MOCK['6m'].vsAnterior.tickets,
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
