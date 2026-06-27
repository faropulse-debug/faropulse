'use client'

import { useState }   from 'react'
import { useRouter }  from 'next/navigation'
import { useAuth }    from '@/hooks/useAuth'
import { fmtPeso }    from '@/lib/format'

// ─── Design tokens (same as owner/v2) ────────────────────────────────────────

const AMBER    = '#f5820a'
const GREEN    = '#22c55e'
const RED      = '#ef4444'
const MUTED    = 'rgba(255,255,255,0.35)'
const MUTED_LO = 'rgba(255,255,255,0.18)'
const CARD_BG  = 'rgba(255,255,255,0.03)'
const CARD_BD  = '1px solid rgba(255,255,255,0.07)'
const FONT_MONO = 'var(--font-dm-mono), monospace'
const FONT_SYNE = "'Syne', sans-serif"
const FONT_BODY = 'var(--font-body), sans-serif'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function today(): string {
  return new Date().toISOString().split('T')[0]
}

function firstOfMonth(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface ReconcileResult {
  ok:          boolean
  from:        string
  to:          string
  rawItems:    number
  generatedAt: string
  range:       { from: string; to: string }
  source:      string
  resumen: {
    coincidenCount:     number
    discrepanciasCount: number
    soloCucinagoCount:  number
    soloMaxirestCount:  number
    totalCucinago:      number
    totalMaxirest:      number
    diffTotal:          number
  }
  discrepancias: { numero: string; totalCucinago: number; totalMaxirest: number; diff: number }[]
  soloCucinago:  { numero: string; total: number }[]
  soloMaxirest:  { external_id: string; total: number }[]
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatCard({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div style={{
      background: CARD_BG, border: CARD_BD,
      borderRadius: '16px', padding: '20px 18px',
      position: 'relative', overflow: 'hidden',
    }}>
      <div style={{
        position: 'absolute', top: 0, left: '15%', right: '15%', height: '1px',
        background: `linear-gradient(90deg, transparent, ${accent ?? MUTED}55, transparent)`,
      }} />
      <div style={{
        fontFamily: FONT_MONO, fontWeight: 600, fontSize: '0.58rem',
        letterSpacing: '0.18em', textTransform: 'uppercase', color: MUTED,
        marginBottom: '12px',
      }}>{label}</div>
      <div style={{
        fontFamily: FONT_BODY, fontWeight: 700, fontSize: '1.5rem',
        lineHeight: 1, color: accent ?? 'rgba(255,255,255,0.92)',
        letterSpacing: '-0.02em',
      }}>{value}</div>
    </div>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontFamily: FONT_MONO, fontSize: '0.6rem', fontWeight: 600,
      letterSpacing: '0.18em', textTransform: 'uppercase',
      color: MUTED, marginBottom: '12px',
    }}>{children}</div>
  )
}

function DataTable({
  columns, rows,
}: {
  columns: { key: string; label: string; align?: 'left' | 'right' }[]
  rows:    Record<string, React.ReactNode>[]
}) {
  const thStyle: React.CSSProperties = {
    fontFamily: FONT_MONO, fontSize: '0.55rem', fontWeight: 600,
    letterSpacing: '0.15em', textTransform: 'uppercase',
    color: MUTED, padding: '8px 12px', borderBottom: '1px solid rgba(255,255,255,0.07)',
  }
  const tdStyle: React.CSSProperties = {
    fontFamily: FONT_BODY, fontSize: '0.78rem',
    color: 'rgba(255,255,255,0.8)', padding: '10px 12px',
    borderBottom: '1px solid rgba(255,255,255,0.04)',
  }

  return (
    <div style={{ background: CARD_BG, border: CARD_BD, borderRadius: '12px', overflow: 'hidden' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            {columns.map(c => (
              <th key={c.key} style={{ ...thStyle, textAlign: c.align ?? 'left' }}>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} style={{ background: i % 2 === 1 ? 'rgba(255,255,255,0.015)' : 'transparent' }}>
              {columns.map(c => (
                <td key={c.key} style={{ ...tdStyle, textAlign: c.align ?? 'left' }}>{row[c.key]}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ReconcilePage() {
  const router         = useRouter()
  const { user, isLoading, error: authError } = useAuth()

  const DEV_FALLBACK_LOCATION = 'bbbbbbbb-0000-0000-0000-000000000001'
  const DEV_FALLBACK_ORG      = 'aaaaaaaa-0000-0000-0000-000000000001'
  const isDev     = process.env.NODE_ENV === 'development'
  const locationId = user?.activeMembership?.location_id ?? (isDev ? DEV_FALLBACK_LOCATION : null)
  const orgId      = user?.activeMembership?.org_id      ?? (isDev ? DEV_FALLBACK_ORG : null)
  const orgName    = user?.activeMembership?.organization?.name ?? 'Dashboard'

  const [from,   setFrom]   = useState(firstOfMonth())
  const [to,     setTo]     = useState(today())
  const [status, setStatus] = useState<'idle' | 'loading' | 'error' | 'result'>('idle')
  const [error,  setError]  = useState<string | null>(null)
  const [result, setResult] = useState<ReconcileResult | null>(null)

  if (isLoading && !isDev) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: MUTED, fontFamily: FONT_MONO, fontSize: '0.75rem', letterSpacing: '0.15em' }}>
        cargando sesión…
      </div>
    )
  }

  if (!locationId || !orgId) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: MUTED, fontFamily: FONT_MONO, fontSize: '0.75rem', letterSpacing: '0.15em' }}>
        {authError ?? 'sin ubicación activa'}
      </div>
    )
  }

  async function runReconcile() {
    setStatus('loading')
    setError(null)
    setResult(null)
    try {
      const res = await fetch('/api/reconcile/cucinago', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ from, to, location_id: locationId, org_id: orgId }),
      })
      const data = await res.json() as ReconcileResult & { error?: string }
      if (!res.ok || !data.ok) {
        setError(data.error ?? `Error ${res.status}`)
        setStatus('error')
        return
      }
      setResult(data)
      setStatus('result')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido')
      setStatus('error')
    }
  }

  const inputStyle: React.CSSProperties = {
    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: '8px', padding: '9px 12px',
    fontFamily: FONT_MONO, fontSize: '0.78rem', color: 'rgba(255,255,255,0.85)',
    outline: 'none', colorScheme: 'dark',
  }

  return (
    <div style={{ padding: '32px 24px', maxWidth: '960px', margin: '0 auto' }}>

      {/* Header */}
      <div style={{ marginBottom: '28px' }}>
        <button
          onClick={() => router.back()}
          style={{
            background: 'transparent', border: 'none', padding: 0,
            fontFamily: FONT_MONO, fontSize: '0.58rem', letterSpacing: '0.15em',
            textTransform: 'uppercase', color: MUTED, cursor: 'pointer',
            marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px',
          }}
        >
          ← {orgName}
        </button>
        <div style={{
          fontFamily: FONT_SYNE, fontWeight: 700, fontSize: '1.35rem',
          color: 'rgba(255,255,255,0.9)', letterSpacing: '-0.01em', marginBottom: '4px',
        }}>
          Reconciliador{' '}
          <span style={{ color: AMBER }}>CucinaGo</span>
        </div>
        <div style={{ fontFamily: FONT_MONO, fontSize: '0.62rem', color: MUTED_LO, letterSpacing: '0.08em' }}>
          Compará las ventas del POS contra las cargadas en FARO, ticket a ticket
        </div>
      </div>

      {/* Controls */}
      <div style={{
        background: CARD_BG, border: CARD_BD, borderRadius: '16px',
        padding: '20px 22px', marginBottom: '28px',
        display: 'flex', alignItems: 'flex-end', gap: '16px', flexWrap: 'wrap',
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <label style={{ fontFamily: FONT_MONO, fontSize: '0.55rem', letterSpacing: '0.15em', textTransform: 'uppercase', color: MUTED }}>
            Desde
          </label>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)} style={inputStyle} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <label style={{ fontFamily: FONT_MONO, fontSize: '0.55rem', letterSpacing: '0.15em', textTransform: 'uppercase', color: MUTED }}>
            Hasta
          </label>
          <input type="date" value={to} onChange={e => setTo(e.target.value)} style={inputStyle} />
        </div>
        <button
          onClick={runReconcile}
          disabled={status === 'loading'}
          style={{
            background:    status === 'loading' ? 'rgba(245,130,10,0.25)' : 'rgba(245,130,10,0.15)',
            border:        `1px solid ${AMBER}55`,
            borderRadius:  '8px', padding: '9px 22px',
            fontFamily:    FONT_SYNE, fontWeight: 700, fontSize: '0.78rem',
            letterSpacing: '0.06em', color: AMBER,
            cursor:        status === 'loading' ? 'not-allowed' : 'pointer',
            transition:    'background 0.15s',
          }}
        >
          {status === 'loading' ? 'Consultando…' : 'Reconciliar'}
        </button>
      </div>

      {/* Loading */}
      {status === 'loading' && (
        <div style={{
          textAlign: 'center', padding: '60px 0',
          fontFamily: FONT_MONO, fontSize: '0.72rem', letterSpacing: '0.14em', color: MUTED,
        }}>
          Consultando CucinaGo y comparando…
          <div style={{ marginTop: '8px', fontSize: '0.6rem', color: MUTED_LO }}>
            (la paginación en vivo puede tardar unos segundos)
          </div>
        </div>
      )}

      {/* Error */}
      {status === 'error' && error && (
        <div style={{
          background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)',
          borderRadius: '12px', padding: '16px 20px',
          fontFamily: FONT_MONO, fontSize: '0.72rem', color: RED, letterSpacing: '0.05em',
        }}>
          ⚠ {error}
        </div>
      )}

      {/* Result */}
      {status === 'result' && result && (() => {
        const { resumen, discrepancias, soloCucinago, soloMaxirest } = result
        const totalIssues = resumen.discrepanciasCount + resumen.soloCucinagoCount + resumen.soloMaxirestCount
        const allOk = totalIssues === 0

        return (
          <div>
            {/* Banner */}
            <div style={{
              background: allOk ? 'rgba(34,197,94,0.08)' : 'rgba(245,130,10,0.08)',
              border:     `1px solid ${allOk ? 'rgba(34,197,94,0.25)' : 'rgba(245,130,10,0.25)'}`,
              borderRadius: '12px', padding: '16px 20px', marginBottom: '24px',
              display: 'flex', alignItems: 'center', gap: '10px',
            }}>
              <span style={{ fontSize: '1rem' }}>{allOk ? '✓' : '⚠'}</span>
              <span style={{
                fontFamily: FONT_SYNE, fontWeight: 700, fontSize: '0.88rem',
                color: allOk ? GREEN : AMBER,
              }}>
                {allOk
                  ? `Las ${resumen.coincidenCount} ventas coinciden al peso — ${fmtPeso(resumen.totalCucinago)}`
                  : `${totalIssues} diferencia${totalIssues > 1 ? 's' : ''} encontrada${totalIssues > 1 ? 's' : ''}`
                }
              </span>
              <span style={{ marginLeft: 'auto', fontFamily: FONT_MONO, fontSize: '0.58rem', color: MUTED, letterSpacing: '0.1em' }}>
                {result.from} → {result.to} · {result.rawItems} líneas CucinaGo
              </span>
            </div>

            {/* Provenance stamp */}
            <div style={{
              fontFamily: FONT_MONO, fontSize: '0.58rem', color: MUTED_LO,
              letterSpacing: '0.07em', marginBottom: '20px',
            }}>
              Datos de CucinaGo en vivo
              {' · '}rango {result.range.from} a {result.range.to}
              {' · '}consultado {new Date(result.generatedAt).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'medium' })}
            </div>

            {/* Stat cards */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
              gap: '14px', marginBottom: '28px',
            }}>
              <StatCard label="Coinciden"       value={String(resumen.coincidenCount)}      accent={GREEN} />
              <StatCard label="Total CucinaGo"  value={fmtPeso(resumen.totalCucinago)}      accent={AMBER} />
              <StatCard label="Total FARO"       value={fmtPeso(resumen.totalMaxirest)}      accent={AMBER} />
              <StatCard
                label="Diferencia"
                value={resumen.diffTotal === 0 ? '$0' : (resumen.diffTotal > 0 ? '+' : '') + fmtPeso(resumen.diffTotal)}
                accent={resumen.diffTotal === 0 ? GREEN : RED}
              />
              {resumen.discrepanciasCount > 0 && (
                <StatCard label="Discrepancias"  value={String(resumen.discrepanciasCount)} accent={RED} />
              )}
              {resumen.soloCucinagoCount > 0 && (
                <StatCard label="Solo en POS"    value={String(resumen.soloCucinagoCount)}  accent={RED} />
              )}
              {resumen.soloMaxirestCount > 0 && (
                <StatCard label="Solo en FARO"   value={String(resumen.soloMaxirestCount)}  accent={AMBER} />
              )}
            </div>

            {/* Discrepancias */}
            {discrepancias.length > 0 && (
              <div style={{ marginBottom: '24px' }}>
                <SectionTitle>Discrepancias — mismo comprobante, distinto monto</SectionTitle>
                <DataTable
                  columns={[
                    { key: 'numero',        label: 'Comprobante' },
                    { key: 'totalCucinago', label: 'CucinaGo',  align: 'right' },
                    { key: 'totalMaxirest', label: 'FARO',       align: 'right' },
                    { key: 'diff',          label: 'Diferencia', align: 'right' },
                  ]}
                  rows={discrepancias.map(d => ({
                    numero:        d.numero,
                    totalCucinago: fmtPeso(d.totalCucinago),
                    totalMaxirest: fmtPeso(d.totalMaxirest),
                    diff:          <span style={{ color: d.diff > 0 ? GREEN : RED, fontWeight: 600 }}>
                                     {(d.diff > 0 ? '+' : '') + fmtPeso(d.diff)}
                                   </span>,
                  }))}
                />
              </div>
            )}

            {/* Solo en CucinaGo */}
            {soloCucinago.length > 0 && (
              <div style={{ marginBottom: '24px' }}>
                <SectionTitle>Solo en CucinaGo — el POS los tiene, no están cargados en FARO</SectionTitle>
                <div style={{ marginBottom: '8px', fontFamily: FONT_MONO, fontSize: '0.6rem', color: RED, letterSpacing: '0.06em' }}>
                  Estas ventas están en el POS pero no se cargaron en FARO. Puede haber importación pendiente.
                </div>
                <DataTable
                  columns={[
                    { key: 'numero', label: 'Comprobante' },
                    { key: 'total',  label: 'Total',       align: 'right' },
                  ]}
                  rows={soloCucinago.map(d => ({
                    numero: d.numero,
                    total:  fmtPeso(d.total),
                  }))}
                />
              </div>
            )}

            {/* Solo en FARO */}
            {soloMaxirest.length > 0 && (
              <div style={{ marginBottom: '24px' }}>
                <SectionTitle>Solo en FARO — cargados pero CucinaGo no los registra en este período</SectionTitle>
                <DataTable
                  columns={[
                    { key: 'external_id', label: 'Comprobante' },
                    { key: 'total',       label: 'Total',        align: 'right' },
                  ]}
                  rows={soloMaxirest.map(d => ({
                    external_id: d.external_id,
                    total:       fmtPeso(d.total),
                  }))}
                />
              </div>
            )}
          </div>
        )
      })()}

    </div>
  )
}
