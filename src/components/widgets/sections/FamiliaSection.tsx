'use client'

import { useState, useMemo }   from 'react'
import { useDashboardData }     from '@/hooks/useDashboardData'
import { SectionLabel }         from '@/components/dashboard/SectionLabel'
import { MonthSelector, currentYM } from '@/src/components/ui/MonthSelector'
import { fmtMillones }          from '@/lib/format'
import {
  computeFamiliaRows,
  buildFamiliaDisplay,
  buildFamiliaInsight,
  prevMonthOf,
  type FamiliaRow,
} from '@/src/lib/familia-helpers'

// ─── Design tokens ────────────────────────────────────────────────────────────

const AMBER     = '#f5820a'
const GREEN     = '#5a8a3c'
const RED       = '#b0413a'
const MUTED     = 'rgba(255,255,255,0.35)'
const MUTED_DIM = 'rgba(255,255,255,0.18)'
const FONT_MONO = 'var(--font-dm-mono), monospace'

const COL_TEMPLATE = '164px 1fr 72px 58px 62px 58px'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function varColor(v: number | null): string {
  if (v === null) return MUTED
  return v >= 0 ? GREEN : RED
}

function varLabel(v: number | null): string {
  if (v === null) return '—'
  return `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`
}

/**
 * From a descending list of YYYY-MM strings, returns the most recent month
 * that is strictly before the current calendar month (i.e. a "closed" month).
 * Falls back to months[0] when no closed month is found.
 */
function defaultClosedMonth(months: string[]): string | null {
  if (!months.length) return null
  const today = currentYM()
  const closed = months.find(m => m < today)
  return closed ?? months[0]
}

// ─── Row component ────────────────────────────────────────────────────────────

function TableRow({ row, maxVentas, isOtras }: { row: FamiliaRow; maxVentas: number; isOtras: boolean }) {
  const barWidth = maxVentas > 0 ? (row.ventas / maxVentas) * 100 : 0

  return (
    <div style={{
      display:               'grid',
      gridTemplateColumns:   COL_TEMPLATE,
      gap:                   '0 8px',
      alignItems:            'center',
      padding:               '5px 0',
      borderBottom:          isOtras ? 'none' : '1px solid rgba(255,255,255,0.03)',
      borderTop:             isOtras ? '1px solid rgba(255,255,255,0.06)' : 'none',
      marginTop:             isOtras ? '4px' : '0',
    }}>
      {/* Familia name */}
      <div style={{
        fontFamily:    FONT_MONO,
        fontSize:      '0.68rem',
        letterSpacing: '0.03em',
        color:         isOtras ? MUTED : 'rgba(255,255,255,0.78)',
        whiteSpace:    'nowrap',
        overflow:      'hidden',
        textOverflow:  'ellipsis',
      }}>
        {row.familia}
      </div>

      {/* Amber bar */}
      <div style={{ height: '3px', background: 'rgba(255,255,255,0.06)', borderRadius: '2px', overflow: 'hidden' }}>
        <div style={{
          height:     '100%',
          width:      `${barWidth}%`,
          background: isOtras ? 'rgba(255,255,255,0.14)' : AMBER,
          borderRadius: '2px',
          transition: 'width 0.4s ease',
        }} />
      </div>

      {/* Ventas */}
      <div style={{ fontFamily: FONT_MONO, fontSize: '0.68rem', color: 'rgba(255,255,255,0.78)', textAlign: 'right' }}>
        {fmtMillones(row.ventas)}
      </div>

      {/* % mix */}
      <div style={{ fontFamily: FONT_MONO, fontSize: '0.63rem', color: MUTED, textAlign: 'right' }}>
        {row.pct.toFixed(1)}%
      </div>

      {/* Cantidad */}
      <div style={{ fontFamily: FONT_MONO, fontSize: '0.63rem', color: MUTED_DIM, textAlign: 'right' }}>
        {row.cantidad.toLocaleString('es-AR')}u
      </div>

      {/* Variación vs mes ant. */}
      <div style={{
        fontFamily: FONT_MONO, fontSize: '0.63rem',
        color:      varColor(row.varPct),
        textAlign:  'right',
        fontWeight: row.varPct !== null ? 600 : 400,
      }}>
        {varLabel(row.varPct)}
      </div>
    </div>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props { locationId: string }

export function FamiliaSection({ locationId }: Props) {
  const { data: liveData, isLoading } = useDashboardData(locationId)
  const [mesOverride, setMesOverride]  = useState<string | null>(null)

  // All available months, sorted descending (most recent first)
  const meses = useMemo(() => {
    if (!liveData?.ventasPorFamilia?.length) return []
    return [...new Set(liveData.ventasPorFamilia.map(r => r.mes))]
      .sort()
      .reverse()
  }, [liveData])

  // Semestre móvil: last 6 months as chips
  const semestre = useMemo(() => meses.slice(0, 6), [meses])

  // Default = last closed month (not the partial current month)
  const defaultMes = useMemo(() => defaultClosedMonth(semestre), [semestre])

  // Active selection: use override only if it's in the visible semestre
  const mesActual = (mesOverride && semestre.includes(mesOverride)) ? mesOverride : defaultMes
  const mesPrev   = mesActual ? prevMonthOf(mesActual) : null

  const display = useMemo(() => {
    if (!liveData?.ventasPorFamilia || !mesActual || !mesPrev) return null
    const rows = computeFamiliaRows(liveData.ventasPorFamilia, mesActual, mesPrev)
    return buildFamiliaDisplay(rows, 7)
  }, [liveData, mesActual, mesPrev])

  const insight = useMemo(
    () => display ? buildFamiliaInsight(display.top) : null,
    [display]
  )

  const allRows: FamiliaRow[] = display
    ? [...display.top, ...(display.otras ? [display.otras] : [])]
    : []

  const maxVentas = allRows.reduce((m, r) => Math.max(m, r.ventas), 0)
  const totalCant = allRows.reduce((s, r) => s + r.cantidad, 0)

  return (
    <div style={{ marginBottom: '52px' }}>
      <SectionLabel>Por Producto</SectionLabel>

      <MonthSelector
        months={semestre}
        selected={mesActual}
        onChange={setMesOverride}
      />

      {isLoading || !display ? (
        <div style={{
          height: '160px', display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: MUTED, fontFamily: FONT_MONO, fontSize: '0.65rem', letterSpacing: '0.12em',
          opacity: isLoading ? 0.4 : 1,
        }}>
          {isLoading ? 'cargando…' : 'sin datos'}
        </div>
      ) : (
        <div style={{ opacity: isLoading ? 0.5 : 1, transition: 'opacity 0.3s' }}>

          {/* Table header */}
          <div style={{
            display:             'grid',
            gridTemplateColumns: COL_TEMPLATE,
            gap:                 '0 8px',
            padding:             '0 0 6px',
            borderBottom:        '1px solid rgba(255,255,255,0.07)',
            marginBottom:        '2px',
          }}>
            {['Familia', '', 'Ventas', '% mix', 'Cant.', 'vs ant.'].map((h, i) => (
              <div key={i} style={{
                fontFamily:     FONT_MONO,
                fontSize:       '0.56rem',
                letterSpacing:  '0.14em',
                textTransform:  'uppercase',
                color:          'rgba(255,255,255,0.22)',
                textAlign:      i === 0 ? 'left' : 'right',
              }}>
                {h}
              </div>
            ))}
          </div>

          {/* Rows */}
          {allRows.map(row => (
            <TableRow
              key={row.familia}
              row={row}
              maxVentas={maxVentas}
              isOtras={row.familia.startsWith('Otras (')}
            />
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
              {fmtMillones(display.total)}
            </div>
            <div style={{ fontFamily: FONT_MONO, fontSize: '0.63rem', color: MUTED, textAlign: 'right' }}>100%</div>
            <div style={{ fontFamily: FONT_MONO, fontSize: '0.63rem', color: MUTED_DIM, textAlign: 'right' }}>
              {totalCant.toLocaleString('es-AR')}u
            </div>
            <div />
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
