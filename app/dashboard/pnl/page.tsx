'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { useAuth } from '@/hooks/useAuth'
import { computePnL, type PnLInputs } from '@/lib/pnl/formulas'

// ── Constants ─────────────────────────────────────────────────────────────────

const AMBER      = '#f5820a'
const GREEN      = '#22c55e'
const RED        = '#ef4444'
const CYAN       = '#06b6d4'
const CARD_BG    = 'rgba(255,255,255,0.025)'
const CARD_BORDER = 'rgba(255,255,255,0.07)'

// ── Formatting ────────────────────────────────────────────────────────────────

function $ar(n: number): string {
  return Math.round(n).toLocaleString('es-AR')
}

function pct(n: number): string {
  return n.toFixed(1) + '%'
}

// ── Field definitions ─────────────────────────────────────────────────────────

const CV_FIELDS: { key: keyof PnLInputs; label: string }[] = [
  { key: 'proteinas',        label: 'Proteínas'         },
  { key: 'lacteos_fiambres', label: 'Lácteos y Fiambres' },
  { key: 'almacen',          label: 'Almacén'            },
  { key: 'postres_cafe',     label: 'Postres y Café'     },
  { key: 'pastas_empanadas', label: 'Pastas/Empanadas'   },
  { key: 'verduras',         label: 'Verduras'           },
  { key: 'bollos',           label: 'Bollos'             },
  { key: 'porcion_muzza',    label: 'Porción de Muzza'   },
  { key: 'descartable',      label: 'Descartable'        },
  { key: 'bebidas',          label: 'Bebidas'            },
  { key: 'quilmes',          label: 'Quilmes'            },
  { key: 'limpieza',         label: 'Limpieza'           },
]

const CF_FIELDS: { key: keyof PnLInputs; label: string }[] = [
  { key: 'sueldos_cargas', label: 'Sueldos y Cargas' },
  { key: 'liq_final',      label: 'Liq. Final'       },
  { key: 'alquiler',       label: 'Alquiler'          },
  { key: 'servicios',      label: 'Servicios'         },
  { key: 'honorarios',     label: 'Honorarios'        },
  { key: 'gastos_varios',  label: 'Gastos Varios'     },
  { key: 'mantenimiento',  label: 'Mantenimiento'     },
  { key: 'impuestos',      label: 'Impuestos'         },
  { key: 'tarjetas',       label: 'Tarjetas'          },
  { key: 'app_dely',       label: 'App Dely'          },
  { key: 'gs_bancarios',   label: 'Gs. Bancarios'     },
]

// ── Initial form state ────────────────────────────────────────────────────────

type FormState = Record<keyof PnLInputs, string>

function emptyForm(): FormState {
  const obj = {} as FormState
  const keys: (keyof PnLInputs)[] = [
    'ventas_salon','ventas_dely',
    'tickets_salon','tickets_takeaway','tickets_dely',
    'proteinas','lacteos_fiambres','almacen','postres_cafe','pastas_empanadas',
    'verduras','bollos','porcion_muzza','descartable','bebidas','quilmes','limpieza',
    'sueldos_cargas','liq_final','alquiler','servicios','honorarios','gastos_varios',
    'mantenimiento','impuestos','tarjetas','app_dely','gs_bancarios',
    'regalias_pct',
  ]
  for (const k of keys) obj[k] = k === 'regalias_pct' ? '5' : ''
  return obj
}

function parseForm(f: FormState): PnLInputs {
  const n = (k: keyof PnLInputs) => {
    const v = parseFloat(f[k].replace(',', '.'))
    return isNaN(v) ? 0 : v
  }
  return {
    ventas_salon: n('ventas_salon'), ventas_dely: n('ventas_dely'),
    tickets_salon: n('tickets_salon'), tickets_takeaway: n('tickets_takeaway'), tickets_dely: n('tickets_dely'),
    proteinas: n('proteinas'), lacteos_fiambres: n('lacteos_fiambres'), almacen: n('almacen'),
    postres_cafe: n('postres_cafe'), pastas_empanadas: n('pastas_empanadas'), verduras: n('verduras'),
    bollos: n('bollos'), porcion_muzza: n('porcion_muzza'), descartable: n('descartable'),
    bebidas: n('bebidas'), quilmes: n('quilmes'), limpieza: n('limpieza'),
    sueldos_cargas: n('sueldos_cargas'), liq_final: n('liq_final'), alquiler: n('alquiler'),
    servicios: n('servicios'), honorarios: n('honorarios'), gastos_varios: n('gastos_varios'),
    mantenimiento: n('mantenimiento'), impuestos: n('impuestos'), tarjetas: n('tarjetas'),
    app_dely: n('app_dely'), gs_bancarios: n('gs_bancarios'),
    regalias_pct: n('regalias_pct'),
  }
}

// ── UI primitives ─────────────────────────────────────────────────────────────

function SceneBackground() {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 0, overflow: 'hidden', pointerEvents: 'none' }}>
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(160deg, #0a0a12 0%, #0d0d1a 50%, #0a0a12 100%)' }} />
      <div style={{ position: 'absolute', width: '60vw', height: '60vw', top: '-15vw', left: '-10vw', background: 'radial-gradient(circle, rgba(245,130,10,0.055) 0%, transparent 68%)', filter: 'blur(50px)' }} />
      <div style={{ position: 'absolute', width: '45vw', height: '45vw', bottom: '-10vw', right: '-5vw', background: 'radial-gradient(circle, rgba(6,182,212,0.04) 0%, transparent 68%)', filter: 'blur(45px)' }} />
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '1px', background: 'linear-gradient(90deg, transparent 0%, rgba(245,130,10,0.3) 50%, transparent 100%)' }} />
    </div>
  )
}

function ArrowLeftIcon() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" />
    </svg>
  )
}

function RefreshIcon({ spinning }: { spinning?: boolean }) {
  return (
    <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
      style={spinning ? { animation: 'faro-spin 1s linear infinite' } : undefined}>
      <polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" />
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
    </svg>
  )
}

function CardShell({ children, accent = AMBER }: { children: React.ReactNode; accent?: string }) {
  return (
    <div style={{
      position: 'relative', background: CARD_BG, border: `1px solid ${CARD_BORDER}`,
      borderRadius: 16, backdropFilter: 'blur(20px)', padding: '24px 24px 20px',
    }}>
      <div style={{ position: 'absolute', top: 0, left: '18%', right: '18%', height: '1px', background: `linear-gradient(90deg, transparent, ${accent}, transparent)`, opacity: 0.55 }} />
      {children}
    </div>
  )
}

const LABEL_STYLE: React.CSSProperties = {
  fontFamily: 'var(--font-display)', fontSize: '0.58rem', letterSpacing: '0.14em',
  textTransform: 'uppercase', color: 'rgba(255,255,255,0.35)', marginBottom: 5, display: 'block',
}

const INPUT_STYLE: React.CSSProperties = {
  width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 7, padding: '9px 12px', color: 'rgba(255,255,255,0.85)',
  fontFamily: 'var(--font-body)', fontSize: '0.84rem', outline: 'none', colorScheme: 'dark',
  boxSizing: 'border-box',
}

interface NumInputProps {
  label:    string
  value:    string
  onChange: (v: string) => void
  disabled?: boolean
  integer?:  boolean
}

function NumInput({ label, value, onChange, disabled, integer }: NumInputProps) {
  return (
    <div>
      <label style={LABEL_STYLE}>{label}</label>
      <input
        type="number" min="0" step={integer ? '1' : 'any'}
        value={value} onChange={e => onChange(e.target.value)}
        disabled={disabled}
        style={{ ...INPUT_STYLE, opacity: disabled ? 0.5 : 1 }}
      />
    </div>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.75rem',
      letterSpacing: '0.14em', textTransform: 'uppercase',
      color: 'rgba(255,255,255,0.6)', marginBottom: 16,
    }}>
      {children}
    </div>
  )
}

// ── Preview P&L ───────────────────────────────────────────────────────────────

interface PreviewRowProps {
  label: string
  amount: number
  pctVal?: number
  accent?: string
  bold?: boolean
  subdued?: boolean
}

function PreviewRow({ label, amount, pctVal, accent, bold, subdued }: PreviewRowProps) {
  const color = accent ?? (subdued ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.65)')
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '7px 0', borderBottom: '1px solid rgba(255,255,255,0.04)',
    }}>
      <span style={{ fontFamily: 'var(--font-body)', fontSize: bold ? '0.82rem' : '0.78rem', color, fontWeight: bold ? 700 : 400 }}>
        {label}
      </span>
      <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
        {pctVal !== undefined && (
          <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.7rem', color: 'rgba(255,255,255,0.28)', minWidth: 48, textAlign: 'right' }}>
            {pct(pctVal)}
          </span>
        )}
        <span style={{ fontFamily: 'var(--font-body)', fontSize: bold ? '0.88rem' : '0.82rem', color, fontWeight: bold ? 700 : 400, minWidth: 110, textAlign: 'right' }}>
          ${$ar(amount)}
        </span>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

type Status = 'idle' | 'syncing' | 'success' | 'error'

export default function PnlPage() {
  const { user } = useAuth()
  const locationId = user?.activeMembership?.location_id ?? ''
  const orgId      = user?.activeMembership?.org_id ?? ''

  const [periodo,  setPeriodo]  = useState('')
  const [form,     setForm]     = useState<FormState>(emptyForm)
  const [status,   setStatus]   = useState<Status>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [savedPeriodo, setSavedPeriodo] = useState('')

  const set = (key: keyof PnLInputs) => (v: string) =>
    setForm(f => ({ ...f, [key]: v }))

  const parsed  = useMemo(() => parseForm(form), [form])
  const computed = useMemo(() => computePnL(parsed), [parsed])

  const canSave = periodo !== '' && locationId !== '' && parsed.ventas_salon > 0 && status !== 'syncing'

  async function handleSave() {
    if (!canSave) return
    setStatus('syncing'); setErrorMsg('')
    try {
      const res = await fetch('/api/pnl', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ periodo, location_id: locationId, org_id: orgId, inputs: parsed }),
      })
      const data = await res.json() as { success?: boolean; error?: string }
      if (!res.ok || data.error) {
        setErrorMsg(data.error ?? `HTTP ${res.status}`)
        setStatus('error')
        return
      }
      setSavedPeriodo(periodo)
      setStatus('success')
    } catch (e: unknown) {
      setErrorMsg(e instanceof Error ? e.message : String(e))
      setStatus('error')
    }
  }

  function handleReset() {
    setForm(emptyForm())
    setPeriodo('')
    setStatus('idle')
    setErrorMsg('')
    setSavedPeriodo('')
  }

  const isBusy = status === 'syncing'

  return (
    <div style={{ position: 'relative', minHeight: '100vh', background: '#0a0a12' }}>
      <SceneBackground />

      <div style={{ position: 'relative', zIndex: 1, maxWidth: 900, margin: '0 auto', padding: '48px 24px 80px' }}>

        {/* Back nav */}
        <div style={{ marginBottom: 32 }}>
          <Link href="/dashboard/upload" style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, textDecoration: 'none',
            fontFamily: 'var(--font-display)', fontSize: '0.62rem', letterSpacing: '0.16em',
            textTransform: 'uppercase', color: 'rgba(255,255,255,0.28)',
          }}>
            <ArrowLeftIcon />
            Carga de Información
          </Link>
        </div>

        {/* Header */}
        <div style={{ marginBottom: 40 }}>
          <div style={{ fontSize: 10, letterSpacing: 3, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', marginBottom: 8 }}>
            FARO<span style={{ color: AMBER }}>PULSE</span>
          </div>
          <h1 style={{
            fontFamily: 'var(--font-display)', fontWeight: 700,
            fontSize: 'clamp(1.6rem, 3vw, 2.2rem)', letterSpacing: '0.06em',
            color: 'rgba(255,255,255,0.92)', margin: '0 0 10px',
          }}>
            P&L Manual
          </h1>
          <div style={{ width: 40, height: 2, background: AMBER, borderRadius: 1, marginBottom: 12 }} />
          <p style={{ fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: '0.88rem', color: 'rgba(255,255,255,0.38)', margin: 0 }}>
            Cargá el Estado de Resultados mensual. Los datos existentes del período serán reemplazados.
          </p>
        </div>

        {!locationId && (
          <div style={{ padding: '14px 18px', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 10, marginBottom: 20 }}>
            <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.75rem', color: 'rgba(245,158,11,0.85)' }}>
              Sesión no detectada. Las cargas requieren estar autenticado con una membresía activa.
            </span>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* ── Periodo ─────────────────────────────────────────────── */}
          <CardShell accent={AMBER}>
            <SectionTitle>Período</SectionTitle>
            <div>
              <label style={LABEL_STYLE}>Mes</label>
              <input
                type="month"
                value={periodo}
                onChange={e => { setPeriodo(e.target.value); setStatus('idle') }}
                disabled={isBusy}
                style={{ ...INPUT_STYLE, maxWidth: 220, opacity: isBusy ? 0.5 : 1 }}
              />
            </div>
          </CardShell>

          {/* ── Ventas + Volumen ─────────────────────────────────────── */}
          <CardShell accent={AMBER}>
            <SectionTitle>Ventas</SectionTitle>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, marginBottom: 24 }}>
              <NumInput label="$ Salón"   value={form.ventas_salon} onChange={set('ventas_salon')} disabled={isBusy} />
              <NumInput label="$ Delivery" value={form.ventas_dely}  onChange={set('ventas_dely')}  disabled={isBusy} />
            </div>
            <SectionTitle>Volumen</SectionTitle>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 14 }}>
              <NumInput label="Tickets Salón"    value={form.tickets_salon}    onChange={set('tickets_salon')}    disabled={isBusy} integer />
              <NumInput label="Tickets Take Away" value={form.tickets_takeaway} onChange={set('tickets_takeaway')} disabled={isBusy} integer />
              <NumInput label="Tickets Delivery"  value={form.tickets_dely}     onChange={set('tickets_dely')}     disabled={isBusy} integer />
            </div>
          </CardShell>

          {/* ── Costos Variables ─────────────────────────────────────── */}
          <CardShell accent="#a78bfa">
            <SectionTitle>Costos Variables (CV)</SectionTitle>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14 }}>
              {CV_FIELDS.map(({ key, label }) => (
                <NumInput key={key} label={label} value={form[key]} onChange={set(key)} disabled={isBusy} />
              ))}
            </div>
          </CardShell>

          {/* ── Costos Fijos ─────────────────────────────────────────── */}
          <CardShell accent={CYAN}>
            <SectionTitle>Costos Fijos (CF)</SectionTitle>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14 }}>
              {CF_FIELDS.map(({ key, label }) => (
                <NumInput key={key} label={label} value={form[key]} onChange={set(key)} disabled={isBusy} />
              ))}
            </div>
          </CardShell>

          {/* ── Regalías ─────────────────────────────────────────────── */}
          <CardShell accent={AMBER}>
            <SectionTitle>Regalías</SectionTitle>
            <div style={{ maxWidth: 200 }}>
              <NumInput label="% Regalías" value={form.regalias_pct} onChange={set('regalias_pct')} disabled={isBusy} />
            </div>
          </CardShell>

          {/* ── Preview P&L ──────────────────────────────────────────── */}
          <CardShell accent={GREEN}>
            <SectionTitle>Preview P&L</SectionTitle>

            {/* Totales principales */}
            <PreviewRow label="Total Ventas"    amount={computed.total_ventas}   bold  accent="rgba(255,255,255,0.88)" />
            <PreviewRow label="  Total CV"      amount={computed.total_costos}   pctVal={computed.pct_costos}   />
            <PreviewRow label="  Total CF"      amount={computed.total_gastos}   pctVal={computed.pct_gastos}   />
            <PreviewRow label="  Regalías"      amount={computed.regalias}       pctVal={computed.pct_regalias} />

            <div style={{ borderTop: '1px solid rgba(255,255,255,0.12)', marginTop: 4, paddingTop: 4 }}>
              <PreviewRow
                label="Resultado Neto"
                amount={computed.resultado_neto}
                pctVal={computed.pct_resultado}
                bold
                accent={computed.resultado_neto >= 0 ? GREEN : RED}
              />
            </div>

            {/* Métricas por ticket */}
            {(parsed.tickets_salon > 0 || parsed.tickets_dely > 0) && (
              <div style={{ marginTop: 16, display: 'flex', gap: 20, flexWrap: 'wrap' }}>
                {parsed.tickets_salon > 0 && (
                  <div>
                    <div style={LABEL_STYLE}>$ x Ticket</div>
                    <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.9rem', color: AMBER, fontWeight: 700 }}>
                      ${$ar(computed.pesos_x_ticket)}
                    </div>
                  </div>
                )}
                {parsed.tickets_dely > 0 && (
                  <div>
                    <div style={LABEL_STYLE}>$ x Pedido Dely</div>
                    <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.9rem', color: CYAN, fontWeight: 700 }}>
                      ${$ar(computed.pesos_x_pedido)}
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardShell>

          {/* ── Guardar ──────────────────────────────────────────────── */}
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              onClick={handleSave}
              disabled={!canSave}
              style={{
                flex: 1, minWidth: 200, padding: '13px 24px',
                background: canSave
                  ? `linear-gradient(135deg, ${AMBER}cc, ${AMBER})`
                  : 'rgba(255,255,255,0.06)',
                border: 'none', borderRadius: 8,
                cursor: canSave ? 'pointer' : 'not-allowed',
                fontFamily: 'var(--font-display)', fontSize: '0.68rem',
                letterSpacing: '0.18em', textTransform: 'uppercase',
                color: canSave ? '#000' : 'rgba(255,255,255,0.25)',
                fontWeight: 700,
                boxShadow: canSave ? `0 4px 20px ${AMBER}40` : 'none',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                transition: 'all 0.15s',
              }}
            >
              {isBusy && <RefreshIcon spinning />}
              {isBusy ? 'Guardando…' : 'Confirmar y Guardar'}
            </button>

            {(status === 'success' || status === 'error') && (
              <button onClick={handleReset} style={{
                padding: '13px 18px', background: 'transparent',
                border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, cursor: 'pointer',
                fontFamily: 'var(--font-display)', fontSize: '0.62rem',
                letterSpacing: '0.15em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.35)',
              }}>
                Nuevo
              </button>
            )}
          </div>

          {/* ── Resultado banner ─────────────────────────────────────── */}
          {status === 'success' && (
            <div style={{
              padding: '14px 18px',
              background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.25)',
              borderRadius: 10, display: 'flex', alignItems: 'center', gap: 10,
            }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: GREEN, boxShadow: `0 0 6px ${GREEN}`, flexShrink: 0 }} />
              <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.8rem', color: 'rgba(255,255,255,0.7)' }}>
                P&L de{' '}
                <strong style={{ color: 'rgba(255,255,255,0.9)' }}>{savedPeriodo}</strong>
                {' '}guardado — 33 filas insertadas.
              </span>
            </div>
          )}

          {status === 'error' && (
            <div style={{
              padding: '14px 18px',
              background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)',
              borderRadius: 10,
            }}>
              <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.78rem', color: '#fca5a5' }}>
                {errorMsg}
              </div>
            </div>
          )}

        </div>
      </div>

      <style>{`@keyframes faro-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
