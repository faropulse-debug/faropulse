'use client'

import { useState, useMemo }              from 'react'
import { useDashboardData }               from '@/hooks/useDashboardData'
import { SectionLabel }                   from '@/components/dashboard/SectionLabel'
import { MonthSelector, currentYM }       from '@/src/components/ui/MonthSelector'
import { fmtMillones }                    from '@/lib/format'
import {
  computeDiaSemanaRows,
  buildDiaSemanaInsight,
  availableMeses,
  type DiaSemanaRow,
} from '@/src/lib/dia-semana-helpers'

// ─── Design tokens ────────────────────────────────────────────────────────────

const AMBER     = '#f5820a'
const MUTED     = 'rgba(255,255,255,0.35)'
const MUTED_DIM = 'rgba(255,255,255,0.18)'
const FONT_MONO = 'var(--font-dm-mono), monospace'

// Día | bar | Total | Prom/día | Pedidos
const COL_TEMPLATE = '44px 1fr 72px 72px 48px'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function defaultClosedMonth(months: string[]): string | null {
  if (!months.length) return null
  const today  = currentYM()
  const closed = months.find(m => m < today)
  return closed ?? months[0]
}

// ─── Row component ────────────────────────────────────────────────────────────

function DowRow({ row, maxVentas }: { row: DiaSemanaRow; maxVentas: number }) {
  const barWidth = maxVentas > 0 ? (row.ventas / maxVentas) * 100 : 0
  const barColor = row.isBest  ? AMBER
                 : row.isWorst ? 'rgba(255,255,255,0.12)'
                 : 'rgba(245,130,10,0.55)'

  const labelColor = row.isBest  ? AMBER
                   : row.isWorst ? MUTED_DIM
                   : 'rgba(255,255,255,0.78)'

  const venColor = row.isBest  ? AMBER
                 : row.isWorst ? MUTED_DIM
                 : 'rgba(255,255,255,0.78)'

  return (
    <div style={{
      display:             'grid',
      gridTemplateColumns: COL_TEMPLATE,
      gap:                 '0 8px',
      alignItems:          'center',
      padding:             '5px 0',
      borderBottom:        '1px solid rgba(255,255,255,0.03)',
    }}>
      {/* Label */}
      <div style={{
        fontFamily:    FONT_MONO,
        fontSize:      '0.68rem',
        letterSpacing: '0.03em',
        color:         labelColor,
        fontWeight:    row.isBest ? 700 : 400,
      }}>
        {row.label}
        {row.isBest  && <span style={{ fontSize: '0.48rem', color: AMBER,   marginLeft: '3px', verticalAlign: 'super' }}>▲</span>}
        {row.isWorst && <span style={{ fontSize: '0.48rem', color: MUTED,   marginLeft: '3px', verticalAlign: 'super' }}>▼</span>}
      </div>

      {/* Bar */}
      <div style={{ height: '3px', background: 'rgba(255,255,255,0.06)', borderRadius: '2px', overflow: 'hidden' }}>
        <div style={{
          height:     '100%',
          width:      `${barWidth}%`,
          background: barColor,
          borderRadius: '2px',
          transition: 'width 0.4s ease',
        }} />
      </div>

      {/* Total */}
      <div style={{
        fontFamily: FONT_MONO, fontSize: '0.68rem',
        color: venColor, textAlign: 'right', fontWeight: row.isBest ? 700 : 400,
      }}>
        {fmtMillones(row.ventas)}
      </div>

      {/* Prom/día */}
      <div style={{ fontFamily: FONT_MONO, fontSize: '0.63rem', color: MUTED, textAlign: 'right' }}>
        {fmtMillones(row.promedio)}
      </div>

      {/* Pedidos */}
      <div style={{ fontFamily: FONT_MONO, fontSize: '0.63rem', color: MUTED_DIM, textAlign: 'right' }}>
        {row.pedidos}
      </div>
    </div>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props { locationId: string }

export function DiaSemanaSection({ locationId }: Props) {
  const { data: liveData, isLoading, isRefreshing } = useDashboardData(locationId)
  const [mesOverride, setMesOverride] = useState<string | null>(null)

  const meses    = useMemo(() => availableMeses(liveData?.ventasPorDiaSemana ?? []), [liveData])
  const semestre = useMemo(() => meses.slice(0, 6), [meses])
  const defaultMes = useMemo(() => defaultClosedMonth(semestre), [semestre])
  const mesActual  = (mesOverride && semestre.includes(mesOverride)) ? mesOverride : defaultMes

  const rows = useMemo(
    () => liveData?.ventasPorDiaSemana && mesActual
      ? computeDiaSemanaRows(liveData.ventasPorDiaSemana, mesActual)
      : [],
    [liveData, mesActual],
  )

  const insight  = useMemo(() => buildDiaSemanaInsight(rows), [rows])
  const maxVentas = rows.reduce((m, r) => Math.max(m, r.ventas), 0)
  const totalVen  = rows.reduce((s, r) => s + r.ventas, 0)
  const totalPed  = rows.reduce((s, r) => s + r.pedidos, 0)

  return (
    <div style={{ marginBottom: '52px' }}>
      <SectionLabel>Por día de semana</SectionLabel>

      <MonthSelector
        months={semestre}
        selected={mesActual}
        onChange={setMesOverride}
      />

      {isLoading || !rows.length ? (
        <div style={{
          height: '160px', display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: MUTED, fontFamily: FONT_MONO, fontSize: '0.65rem', letterSpacing: '0.12em',
          opacity: isLoading ? 0.4 : 1,
        }}>
          {isLoading ? 'cargando…' : 'sin datos'}
        </div>
      ) : (
        <div style={{ opacity: (isLoading || isRefreshing) ? 0.5 : 1, transition: 'opacity 0.3s' }}>

          {/* Table header */}
          <div style={{
            display:             'grid',
            gridTemplateColumns: COL_TEMPLATE,
            gap:                 '0 8px',
            padding:             '0 0 6px',
            borderBottom:        '1px solid rgba(255,255,255,0.07)',
            marginBottom:        '2px',
          }}>
            {['Día', '', 'Total', 'Prom/día', 'Ped.'].map((h, i) => (
              <div key={i} style={{
                fontFamily:    FONT_MONO,
                fontSize:      '0.56rem',
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                color:         'rgba(255,255,255,0.22)',
                textAlign:     i === 0 ? 'left' : 'right',
              }}>
                {h}
              </div>
            ))}
          </div>

          {/* Rows */}
          {rows.map(row => (
            <DowRow key={row.dow} row={row} maxVentas={maxVentas} />
          ))}

          {/* Total row */}
          <div style={{
            display:             'grid',
            gridTemplateColumns: COL_TEMPLATE,
            gap:                 '0 8px',
            alignItems:          'center',
            padding:             '7px 0 0',
            borderTop:           '1px solid rgba(255,255,255,0.10)',
            marginTop:           '6px',
          }}>
            <div style={{ fontFamily: FONT_MONO, fontSize: '0.58rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: MUTED }}>
              Total
            </div>
            <div />
            <div style={{ fontFamily: FONT_MONO, fontSize: '0.70rem', color: 'rgba(255,255,255,0.88)', textAlign: 'right', fontWeight: 600 }}>
              {fmtMillones(totalVen)}
            </div>
            <div />
            <div style={{ fontFamily: FONT_MONO, fontSize: '0.63rem', color: MUTED_DIM, textAlign: 'right' }}>
              {totalPed}
            </div>
          </div>

          {/* Insight */}
          {insight && (
            <div style={{
              marginTop:     '16px',
              fontFamily:    FONT_MONO,
              fontSize:      '0.63rem',
              letterSpacing: '0.04em',
              lineHeight:    1.7,
              color:         'rgba(255,255,255,0.38)',
              borderLeft:    `2px solid ${AMBER}`,
              paddingLeft:   '12px',
            }}>
              {insight}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
