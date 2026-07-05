'use client'

import { useState, useRef, useCallback } from 'react'
import Link from 'next/link'
import { useAuth } from '@/hooks/useAuth'
import { translateUploadError } from '@/src/lib/upload/error-messages'

// ── Types ─────────────────────────────────────────────────────────────────────

type CardStatus = 'idle' | 'ready' | 'previewing' | 'preview' | 'syncing' | 'success' | 'error'

interface FileSlot {
  file:     File | null
  dragging: boolean
}

interface SalesSummary {
  documentsProcessed: number
  documentsInserted:  number
  documentsDeleted:   number
  documentsRejected:  number
  itemsProcessed:     number
  itemsInserted:      number
  itemsDeleted?:      number
  dateRange:          { from: string; to: string } | null
  rejectedReasons:    Record<string, number>
}

interface DocsSummary  { processed: number; new: number; updated: number; rejected: number }
interface ItemsSummary { processed: number; new: number; updated: number; rejected: number }

interface UploadResult {
  // structured fields (from /api/upload/sales and /api/upload/items)
  documents?:     DocsSummary
  items?:         ItemsSummary
  // sales route (structured summary — legacy)
  summary?:       SalesSummary
  // sales route (flat, backward compat)
  docsInserted?:  number
  docsSkipped?:   number
  docsFailed?:    number
  itemsInserted?: number
  itemsSkipped?:  number
  itemsFailed?:   number
  dateRange?:     string
  errors?:        string[]
  // financial route
  rowsInserted?:  number
  periodos?:      string[]
  // cucinago route
  rawItems?:      number
  message?:       string
  // dry-run preview fields
  status?:        string
  dryRun?:        boolean
  wouldCommit?:   boolean
  rejections?:    unknown[]
}

// ── Constants ─────────────────────────────────────────────────────────────────

const AMBER      = '#f5820a'
const GREEN      = '#22c55e'
const CYAN       = '#06b6d4'
const RED        = '#ef4444'
const CARD_BG    = 'rgba(255,255,255,0.025)'
const CARD_BORDER = 'rgba(255,255,255,0.07)'
const VIOLET      = '#a78bfa'

const SHOW_CUCINAGO_SYNC = false

// ── Background ────────────────────────────────────────────────────────────────

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

// ── Icons ─────────────────────────────────────────────────────────────────────

function UploadCloudIcon({ size = 28, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="16 16 12 12 8 16" /><line x1="12" y1="12" x2="12" y2="21" />
      <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3" />
    </svg>
  )
}

function FileCheckIcon({ size = 20, color = GREEN }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" /><polyline points="9 15 11 17 15 13" />
    </svg>
  )
}

function RefreshIcon({ size = 28, color = 'currentColor', spinning = false }: { size?: number; color?: string; spinning?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
      style={spinning ? { animation: 'faro-spin 1s linear infinite' } : undefined}>
      <polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" />
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
    </svg>
  )
}

function SpreadsheetIcon({ size = 28, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <line x1="3" y1="9" x2="21" y2="9" /><line x1="3" y1="15" x2="21" y2="15" />
      <line x1="9" y1="3" x2="9" y2="21" /><line x1="15" y1="3" x2="15" y2="21" />
    </svg>
  )
}

function ReceiptIcon({ size = 28, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1-2-1z" />
      <line x1="9" y1="9" x2="15" y2="9" /><line x1="9" y1="13" x2="15" y2="13" />
    </svg>
  )
}

function ArrowLeftIcon({ size = 16, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" />
    </svg>
  )
}

// ── Status Pill ───────────────────────────────────────────────────────────────

function StatusPill({ status }: { status: CardStatus }) {
  const map: Record<CardStatus, { label: string; color: string; bg: string }> = {
    idle:       { label: 'Esperando',              color: 'rgba(255,255,255,0.35)', bg: 'rgba(255,255,255,0.06)' },
    ready:      { label: 'Listo',                  color: '#f59e0b',               bg: 'rgba(245,158,11,0.12)'  },
    previewing: { label: 'Analizando…',            color: AMBER,                   bg: 'rgba(245,130,10,0.12)'  },
    preview:    { label: 'Revisá antes de aplicar', color: AMBER,                   bg: 'rgba(245,130,10,0.12)'  },
    syncing:    { label: 'Procesando',             color: CYAN,                    bg: 'rgba(6,182,212,0.12)'   },
    success:    { label: 'Completado',             color: GREEN,                   bg: 'rgba(34,197,94,0.12)'   },
    error:      { label: 'Error',                  color: RED,                     bg: 'rgba(239,68,68,0.12)'   },
  }
  const s = map[status]
  return (
    <span style={{
      fontFamily: 'var(--font-display)', fontSize: '0.6rem', letterSpacing: '0.14em',
      textTransform: 'uppercase', color: s.color, background: s.bg,
      padding: '3px 10px', borderRadius: 20, border: `1px solid ${s.color}40`,
    }}>
      {s.label}
    </span>
  )
}

// ── Result Banner ─────────────────────────────────────────────────────────────

// Used by P&L and CucinaGo cards
function ResultBanner({ status, result, error }: { status: CardStatus; result: UploadResult | null; error: string }) {
  if (status !== 'success' && status !== 'error') return null
  const isOk  = status === 'success'
  const color = isOk ? GREEN : RED
  const bg    = isOk ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)'
  return (
    <div style={{ padding: '12px 16px', background: bg, border: `1px solid ${color}30`, borderRadius: 8, display: 'flex', alignItems: 'flex-start', gap: 10 }}>
      <div style={{ width: 8, height: 8, borderRadius: '50%', background: color, marginTop: 5, flexShrink: 0, boxShadow: `0 0 6px ${color}` }} />
      <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.78rem', color: 'rgba(255,255,255,0.65)', lineHeight: 1.55 }}>
        {isOk ? (
          result?.summary ? (
            <>
              <div>
                ✓ Cargados{' '}
                <strong style={{ color: 'rgba(255,255,255,0.85)' }}>{result.summary.documentsInserted.toLocaleString()}</strong>
                {' '}documentos
                {result.summary.dateRange && (
                  <> del{' '}
                    <strong style={{ color: 'rgba(255,255,255,0.85)' }}>{result.summary.dateRange.from}</strong>
                    {' '}al{' '}
                    <strong style={{ color: 'rgba(255,255,255,0.85)' }}>{result.summary.dateRange.to}</strong>
                  </>
                )}.
              </div>
              {result.summary.itemsInserted > 0 && (
                <div>
                  +{' '}
                  <strong style={{ color: 'rgba(255,255,255,0.85)' }}>{result.summary.itemsInserted.toLocaleString()}</strong>
                  {' '}ítems cargados.
                </div>
              )}
              {result.summary.documentsDeleted > 0 && (
                <div style={{ color: 'rgba(255,255,255,0.4)' }}>
                  {result.summary.documentsDeleted.toLocaleString()} documentos anteriores reemplazados.
                </div>
              )}
              {result.summary.documentsRejected > 0 && (
                <div style={{ color: '#f59e0b' }}>
                  Rechazados {result.summary.documentsRejected.toLocaleString()}
                  {result.summary.rejectedReasons.fecha_invalida
                    ? ` (${result.summary.rejectedReasons.fecha_invalida} fechas inválidas)`
                    : result.summary.rejectedReasons.sin_numero
                    ? ` (${result.summary.rejectedReasons.sin_numero} sin número)`
                    : ' (datos inválidos)'}.
                </div>
              )}
            </>
          ) : (
            <>
              {result?.rowsInserted  != null && <div>✓ <strong style={{ color: 'rgba(255,255,255,0.85)' }}>{result.rowsInserted.toLocaleString()}</strong> filas insertadas</div>}
              {result?.periodos      != null && <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.72rem' }}>Períodos: {result.periodos.join(', ')}</div>}
              {result?.docsInserted  != null && <div>✓ <strong style={{ color: 'rgba(255,255,255,0.85)' }}>{result.docsInserted.toLocaleString()}</strong> órdenes</div>}
              {result?.itemsInserted != null && <div>✓ <strong style={{ color: 'rgba(255,255,255,0.85)' }}>{result.itemsInserted.toLocaleString()}</strong> ítems</div>}
              {result?.message       != null && <div>{result.message}</div>}
            </>
          )
        ) : (
          <div style={{ color: '#fca5a5' }}>{error}</div>
        )}
      </div>
    </div>
  )
}

// Used by CardVentas and CardItems — shows new/updated/rejected from structured API response
function SalesZoneBanner({ status, result, error, errorDetails, type }: {
  status: CardStatus; result: UploadResult | null; error: string; errorDetails?: string[]; type: 'ventas' | 'items'
}) {
  const [showTecnico, setShowTecnico] = useState(false)
  if (status !== 'success' && status !== 'error') return null
  const isOk = status === 'success'
  const color = isOk ? GREEN : RED
  const bg    = isOk ? 'rgba(34,197,94,0.06)' : 'rgba(239,68,68,0.06)'
  const summ  = type === 'ventas' ? result?.documents : result?.items

  if (!isOk) {
    const msg = translateUploadError(error, errorDetails)
    return (
      <div style={{ padding: '10px 14px', background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.22)', borderRadius: 7, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.78rem', color: '#fca5a5', fontWeight: 600 }}>
          {msg.titulo}
        </div>
        <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.72rem', color: 'rgba(255,255,255,0.55)', lineHeight: 1.5 }}>
          {msg.detalle}
        </div>
        {msg.tecnico && (
          <details open={showTecnico} onToggle={e => setShowTecnico((e.currentTarget as HTMLDetailsElement).open)}
            style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: '0.62rem', marginTop: 2 }}>
            <summary style={{ cursor: 'pointer', color: 'rgba(255,255,255,0.25)', listStyle: 'none', userSelect: 'none' }}>
              {showTecnico ? '▾' : '▸'} Ver detalle técnico
            </summary>
            <div style={{
              marginTop: 6, padding: '6px 10px',
              background: 'rgba(0,0,0,0.3)', borderRadius: 5,
              color: 'rgba(255,255,255,0.35)', wordBreak: 'break-all', lineHeight: 1.6,
            }}>
              {msg.tecnico}
            </div>
          </details>
        )}
      </div>
    )
  }

  if (!summ) return null

  return (
    <div style={{ padding: '10px 14px', background: bg, border: `1px solid ${color}25`, borderRadius: 7 }}>
      <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.78rem', color: 'rgba(255,255,255,0.65)', lineHeight: 1.6 }}>
        <div>
          <span style={{ color: GREEN, fontWeight: 600 }}>✓ Carga exitosa</span>
          {' · '}
          <strong style={{ color: 'rgba(255,255,255,0.88)' }}>{summ.new.toLocaleString()}</strong>
          {' '}nuevos,{' '}
          <strong style={{ color: 'rgba(255,255,255,0.88)' }}>{summ.updated.toLocaleString()}</strong>
          {' '}actualizados
          {result?.dateRange && (
            <span style={{ color: 'rgba(255,255,255,0.38)' }}> ({result.dateRange})</span>
          )}
        </div>
        {summ.rejected > 0 && (
          <div style={{ color: '#f59e0b', fontSize: '0.7rem', marginTop: 2 }}>
            ⚠ {summ.rejected.toLocaleString()} {summ.rejected === 1 ? 'fila rechazada' : 'filas rechazadas'}
          </div>
        )}
        {result?.errors?.map((e, i) => (
          <div key={i} style={{ color: '#f59e0b', fontSize: '0.66rem', marginTop: 2 }}>⚠ {e}</div>
        ))}
      </div>
    </div>
  )
}

// ── Drop Zone ─────────────────────────────────────────────────────────────────

interface DropZoneProps {
  label:       string
  file:        File | null
  dragging:    boolean
  onFile:      (f: File) => void
  onDragEnter: () => void
  onDragLeave: () => void
  accent?:     string
  disabled?:   boolean
}

function DropZone({ label, file, dragging, onFile, onDragEnter, onDragLeave, accent = AMBER, disabled }: DropZoneProps) {
  const ref = useRef<HTMLInputElement>(null)

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    if (disabled) return
    onDragLeave()
    const f = e.dataTransfer.files[0]
    if (f) onFile(f)
  }, [onFile, onDragLeave, disabled])

  return (
    <div
      onDragOver={e => { e.preventDefault(); if (!disabled) onDragEnter() }}
      onDragLeave={onDragLeave}
      onDrop={handleDrop}
      onClick={() => !disabled && ref.current?.click()}
      style={{
        flex: 1,
        border: `1.5px dashed ${file ? accent + '80' : dragging ? accent : 'rgba(255,255,255,0.12)'}`,
        borderRadius: 10, padding: '20px 14px',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
        cursor: disabled ? 'not-allowed' : 'pointer', transition: 'all 0.15s',
        background: file ? `${accent}08` : dragging ? `${accent}06` : 'transparent',
        minHeight: 100, justifyContent: 'center',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {file ? (
        <>
          <FileCheckIcon size={22} color={GREEN} />
          <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.72rem', color: 'rgba(255,255,255,0.75)', textAlign: 'center', wordBreak: 'break-all', lineHeight: 1.4 }}>
            {file.name}
          </span>
          {!disabled && <span style={{ fontFamily: 'var(--font-display)', fontSize: '0.58rem', letterSpacing: '0.1em', color: GREEN, textTransform: 'uppercase' }}>Cambiar</span>}
        </>
      ) : (
        <>
          <UploadCloudIcon size={24} color={dragging ? accent : 'rgba(255,255,255,0.22)'} />
          <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)', textAlign: 'center' }}>{label}</span>
          <span style={{ fontFamily: 'var(--font-display)', fontSize: '0.57rem', letterSpacing: '0.1em', color: 'rgba(255,255,255,0.2)', textTransform: 'uppercase' }}>.xlsx · .xls</span>
        </>
      )}
      <input ref={ref} type="file" accept=".xlsx,.xls" style={{ display: 'none' }}
        onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f) }} disabled={disabled} />
    </div>
  )
}

// ── Card Shell ────────────────────────────────────────────────────────────────

function CardShell({ children, accent = AMBER }: { children: React.ReactNode; accent?: string }) {
  return (
    <div style={{
      position: 'relative', background: CARD_BG, border: `1px solid ${CARD_BORDER}`,
      borderRadius: 16, backdropFilter: 'blur(20px)', padding: '28px 28px 24px',
      display: 'flex', flexDirection: 'column', gap: 20,
    }}>
      <div style={{ position: 'absolute', top: 0, left: '18%', right: '18%', height: '1px', background: `linear-gradient(90deg, transparent, ${accent}, transparent)`, opacity: 0.55 }} />
      {children}
    </div>
  )
}

function CardHeader({ icon, title, description, status, accent = AMBER }: {
  icon: React.ReactNode; title: string; description: string; status: CardStatus; accent?: string
}) {
  return (
    <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
      <div style={{ width: 52, height: 52, borderRadius: 12, flexShrink: 0, background: `${accent}12`, border: `1px solid ${accent}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: accent }}>
        {icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4, flexWrap: 'wrap' }}>
          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.9rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.88)' }}>
            {title}
          </span>
          <StatusPill status={status} />
        </div>
        <p style={{ fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: '0.8rem', lineHeight: 1.55, color: 'rgba(255,255,255,0.42)', margin: 0 }}>{description}</p>
      </div>
    </div>
  )
}

// ── Primary Button ────────────────────────────────────────────────────────────

function PrimaryBtn({ label, onClick, disabled, accent, loading }: {
  label: string; onClick: () => void; disabled?: boolean; accent: string; loading?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      style={{
        flex: 1, padding: '11px 20px',
        background: disabled || loading ? 'rgba(255,255,255,0.06)' : `linear-gradient(135deg, ${accent}cc, ${accent})`,
        border: 'none', borderRadius: 8,
        cursor: disabled || loading ? 'not-allowed' : 'pointer',
        fontFamily: 'var(--font-display)', fontSize: '0.65rem', letterSpacing: '0.18em',
        textTransform: 'uppercase',
        color: disabled || loading ? 'rgba(255,255,255,0.3)' : '#000',
        fontWeight: 700,
        boxShadow: disabled || loading ? 'none' : `0 4px 20px ${accent}40`,
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        transition: 'all 0.15s',
      }}
    >
      {loading && <RefreshIcon size={13} color="#000" spinning />}
      {label}
    </button>
  )
}

function SecondaryBtn({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      padding: '11px 16px', background: 'transparent',
      border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, cursor: 'pointer',
      fontFamily: 'var(--font-display)', fontSize: '0.62rem', letterSpacing: '0.15em',
      textTransform: 'uppercase', color: 'rgba(255,255,255,0.35)',
    }}>
      {label}
    </button>
  )
}

// ── Preview components ────────────────────────────────────────────────────────

function PreviewStatCard({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div style={{
      background: CARD_BG, border: `1px solid ${CARD_BORDER}`,
      borderRadius: 10, padding: '12px 14px',
      position: 'relative', overflow: 'hidden',
    }}>
      <div style={{
        position: 'absolute', top: 0, left: '15%', right: '15%', height: '1px',
        background: `linear-gradient(90deg, transparent, ${accent}55, transparent)`,
      }} />
      <div style={{
        fontFamily: 'var(--font-display)', fontSize: '0.55rem',
        letterSpacing: '0.16em', textTransform: 'uppercase',
        color: 'rgba(255,255,255,0.35)', marginBottom: 8,
      }}>{label}</div>
      <div style={{
        fontFamily: 'var(--font-body)', fontWeight: 700,
        fontSize: '1.35rem', lineHeight: 1,
        color: accent,
      }}>{value}</div>
    </div>
  )
}

function PreviewBanner({ result, accent: _accent }: { result: UploadResult; accent: string }) {
  const docs = result.documents ?? result.items
  if (result.status === 'dry_run_duplicate') {
    return (
      <div style={{
        padding: '12px 16px', borderRadius: 8,
        background: 'rgba(245,130,10,0.08)', border: '1px solid rgba(245,130,10,0.22)',
        fontFamily: 'var(--font-body)', fontSize: '0.78rem',
        color: 'rgba(245,158,11,0.85)',
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <span>⚠</span>
        <span>
          Este archivo ya fue cargado anteriormente.
          {docs && (
            <span style={{ color: 'rgba(255,255,255,0.4)', marginLeft: 8 }}>
              ({docs.new} nuevos · {docs.updated} actualizados)
            </span>
          )}
        </span>
      </div>
    )
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
        <PreviewStatCard label="Nuevos"       value={String(docs?.new      ?? 0)} accent={GREEN} />
        <PreviewStatCard label="A actualizar" value={String(docs?.updated  ?? 0)} accent={AMBER} />
        <PreviewStatCard label="Rechazados"   value={String(docs?.rejected ?? 0)}
          accent={(docs?.rejected ?? 0) > 0 ? RED : 'rgba(255,255,255,0.35)'} />
      </div>
      {result.dateRange && (
        <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.7rem', color: 'rgba(255,255,255,0.3)' }}>
          {result.dateRange}
        </div>
      )}
      {(result.rejections?.length ?? 0) > 0 && (
        <details style={{ fontFamily: 'var(--font-body)', fontSize: '0.7rem', color: 'rgba(255,255,255,0.45)' }}>
          <summary style={{ cursor: 'pointer', color: '#f59e0b', marginBottom: 4 }}>
            {result.rejections!.length} filas rechazadas
          </summary>
          <div style={{
            maxHeight: 120, overflowY: 'auto',
            background: 'rgba(255,255,255,0.03)', borderRadius: 6, padding: '8px 10px',
          }}>
            {result.rejections!.slice(0, 50).map((r, i) => (
              <div key={i} style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.65rem', lineHeight: 1.5 }}>
                {JSON.stringify(r)}
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  )
}

function PreviewActions({ accent, onApply, onCancel }: {
  accent: string; onApply: () => void; onCancel: () => void
}) {
  return (
    <div style={{ display: 'flex', gap: 8 }}>
      <PrimaryBtn label="Aplicar" onClick={onApply} accent={accent} />
      <SecondaryBtn label="Cancelar" onClick={onCancel} />
    </div>
  )
}

// ── No Auth Warning ───────────────────────────────────────────────────────────

function NoAuthWarning() {
  return (
    <div style={{ padding: '14px 18px', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 10, marginBottom: 20 }}>
      <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.75rem', color: 'rgba(245,158,11,0.85)' }}>
        Sesión no detectada. Las cargas requieren estar autenticado con una membresía activa.
      </span>
    </div>
  )
}

// ── Card A: P&L Manual (nav) ──────────────────────────────────────────────────

function CardPnLNav() {
  return (
    <CardShell accent={AMBER}>
      <CardHeader
        icon={<SpreadsheetIcon size={26} />}
        title="Cargar P&L"
        description="Estado de Resultados mensual. Ingresá los datos manualmente, período a período."
        status="ready" accent={AMBER}
      />
      <Link
        href="/dashboard/pnl"
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          padding: '11px 20px', textDecoration: 'none',
          background: `linear-gradient(135deg, ${AMBER}cc, ${AMBER})`,
          borderRadius: 8,
          fontFamily: 'var(--font-display)', fontSize: '0.65rem',
          letterSpacing: '0.18em', textTransform: 'uppercase',
          color: '#000', fontWeight: 700,
          boxShadow: `0 4px 20px ${AMBER}40`,
        }}
      >
        Abrir formulario
      </Link>
    </CardShell>
  )
}

// ── Card B: Ventas (independent) ─────────────────────────────────────────────

function CardVentas({ locationId, orgId }: { locationId: string; orgId: string }) {
  const [slot,          setSlot]          = useState<FileSlot>({ file: null, dragging: false })
  const [status,        setStatus]        = useState<CardStatus>('idle')
  const [result,        setResult]        = useState<UploadResult | null>(null)
  const [previewResult, setPreviewResult] = useState<UploadResult | null>(null)
  const [error,         setError]         = useState('')
  const [errorDetails,  setErrorDetails]  = useState<string[]>([])

  const cardStatus: CardStatus = status !== 'idle' ? status : slot.file ? 'ready' : 'idle'
  const isBusy = status === 'previewing' || status === 'syncing'

  function reset() {
    setSlot({ file: null, dragging: false })
    setStatus('idle')
    setResult(null)
    setPreviewResult(null)
    setError('')
    setErrorDetails([])
  }

  function buildForm() {
    const form = new FormData()
    form.append('ventas',      slot.file!)
    form.append('location_id', locationId)
    form.append('org_id',      orgId)
    return form
  }

  async function doPreview() {
    if (!slot.file || !locationId) return
    setStatus('previewing'); setError(''); setErrorDetails([]); setPreviewResult(null)
    try {
      const res  = await fetch('/api/upload/sales?dry_run=true', { method: 'POST', body: buildForm() })
      const data = await res.json()
      if (!res.ok || data.error) {
        setError(data.error ?? `HTTP ${res.status}`)
        setErrorDetails(data.errors ?? [])
        setStatus('error')
        return
      }
      setPreviewResult(data); setStatus('preview')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e)); setStatus('error')
    }
  }

  async function doApply() {
    if (!slot.file || !locationId) return
    setStatus('syncing'); setError(''); setErrorDetails([]); setResult(null)
    try {
      const res  = await fetch('/api/upload/sales', { method: 'POST', body: buildForm() })
      const data = await res.json()
      if (!res.ok || data.error) {
        setError(data.error ?? `HTTP ${res.status}`)
        setErrorDetails(data.errors ?? [])
        setStatus('error')
        return
      }
      setResult(data); setStatus('success')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e)); setStatus('error')
    }
  }

  return (
    <CardShell accent="#fb923c">
      <CardHeader
        icon={<ReceiptIcon size={26} />}
        title="Cargar Ventas"
        description="Reporte de ventas del POS. Cada carga reemplaza los documentos del período."
        status={cardStatus} accent="#fb923c"
      />
      <DropZone label="Excel de ventas" file={slot.file} dragging={slot.dragging}
        disabled={isBusy}
        onFile={f => { setSlot(s => ({ ...s, file: f })); setStatus('idle'); setPreviewResult(null) }}
        onDragEnter={() => setSlot(s => ({ ...s, dragging: true }))}
        onDragLeave={() => setSlot(s => ({ ...s, dragging: false }))}
        accent="#fb923c"
      />
      {status === 'preview' && previewResult && (
        <PreviewBanner result={previewResult} accent="#fb923c" />
      )}
      {status === 'preview' && (
        <PreviewActions
          accent="#fb923c"
          onApply={doApply}
          onCancel={() => { setPreviewResult(null); setStatus('idle') }}
        />
      )}
      <SalesZoneBanner status={status} result={result} error={error} errorDetails={errorDetails} type="ventas" />
      {(slot.file || status !== 'idle') && status !== 'preview' && (
        <div style={{ display: 'flex', gap: 8 }}>
          <PrimaryBtn
            label={isBusy ? (status === 'previewing' ? 'Analizando…' : 'Aplicando…') : 'Previsualizar'}
            onClick={doPreview}
            disabled={!slot.file || isBusy || !locationId}
            accent="#fb923c"
            loading={isBusy}
          />
          <SecondaryBtn label="Limpiar" onClick={reset} />
        </div>
      )}
    </CardShell>
  )
}

// ── Card C: Ítems (independent) ───────────────────────────────────────────────

function CardItems({ locationId, orgId }: { locationId: string; orgId: string }) {
  const [slot,          setSlot]          = useState<FileSlot>({ file: null, dragging: false })
  const [status,        setStatus]        = useState<CardStatus>('idle')
  const [result,        setResult]        = useState<UploadResult | null>(null)
  const [previewResult, setPreviewResult] = useState<UploadResult | null>(null)
  const [error,         setError]         = useState('')
  const [errorDetails,  setErrorDetails]  = useState<string[]>([])

  const cardStatus: CardStatus = status !== 'idle' ? status : slot.file ? 'ready' : 'idle'
  const isBusy = status === 'previewing' || status === 'syncing'

  function reset() {
    setSlot({ file: null, dragging: false })
    setStatus('idle')
    setResult(null)
    setPreviewResult(null)
    setError('')
    setErrorDetails([])
  }

  function buildForm() {
    const form = new FormData()
    form.append('items',       slot.file!)
    form.append('location_id', locationId)
    form.append('org_id',      orgId)
    return form
  }

  async function doPreview() {
    if (!slot.file || !locationId) return
    setStatus('previewing'); setError(''); setErrorDetails([]); setPreviewResult(null)
    try {
      const res  = await fetch('/api/upload/items?dry_run=true', { method: 'POST', body: buildForm() })
      const data = await res.json()
      if (!res.ok || data.error) {
        setError(data.error ?? `HTTP ${res.status}`)
        setErrorDetails(data.errors ?? [])
        setStatus('error')
        return
      }
      setPreviewResult(data); setStatus('preview')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e)); setStatus('error')
    }
  }

  async function doApply() {
    if (!slot.file || !locationId) return
    setStatus('syncing'); setError(''); setErrorDetails([]); setResult(null)
    try {
      const res  = await fetch('/api/upload/items', { method: 'POST', body: buildForm() })
      const data = await res.json()
      if (!res.ok || data.error) {
        setError(data.error ?? `HTTP ${res.status}`)
        setErrorDetails(data.errors ?? [])
        setStatus('error')
        return
      }
      setResult(data); setStatus('success')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e)); setStatus('error')
    }
  }

  return (
    <CardShell accent={VIOLET}>
      <CardHeader
        icon={<SpreadsheetIcon size={26} />}
        title="Cargar Ítems"
        description="Detalle de ítems por orden del POS. Puede cargarse independientemente de las ventas."
        status={cardStatus} accent={VIOLET}
      />
      <DropZone label="Excel de ítems" file={slot.file} dragging={slot.dragging}
        disabled={isBusy}
        onFile={f => { setSlot(s => ({ ...s, file: f })); setStatus('idle'); setPreviewResult(null) }}
        onDragEnter={() => setSlot(s => ({ ...s, dragging: true }))}
        onDragLeave={() => setSlot(s => ({ ...s, dragging: false }))}
        accent={VIOLET}
      />
      {status === 'preview' && previewResult && (
        <PreviewBanner result={previewResult} accent={VIOLET} />
      )}
      {status === 'preview' && (
        <PreviewActions
          accent={VIOLET}
          onApply={doApply}
          onCancel={() => { setPreviewResult(null); setStatus('idle') }}
        />
      )}
      <SalesZoneBanner status={status} result={result} error={error} errorDetails={errorDetails} type="items" />
      {(slot.file || status !== 'idle') && status !== 'preview' && (
        <div style={{ display: 'flex', gap: 8 }}>
          <PrimaryBtn
            label={isBusy ? (status === 'previewing' ? 'Analizando…' : 'Aplicando…') : 'Previsualizar'}
            onClick={doPreview}
            disabled={!slot.file || isBusy || !locationId}
            accent={VIOLET}
            loading={isBusy}
          />
          <SecondaryBtn label="Limpiar" onClick={reset} />
        </div>
      )}
    </CardShell>
  )
}

// ── Card D: CucinaGo ──────────────────────────────────────────────────────────

function CardCucinaGo({ locationId, orgId }: { locationId: string; orgId: string }) {
  const today        = new Date().toISOString().slice(0, 10)
  const firstOfMonth = today.slice(0, 8) + '01'
  const [desde,   setDesde]  = useState(firstOfMonth)
  const [hasta,   setHasta]  = useState(today)
  const [status,  setStatus] = useState<CardStatus>('idle')
  const [result,  setResult] = useState<UploadResult | null>(null)
  const [error,   setError]  = useState('')

  const inputStyle: React.CSSProperties = {
    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 8, padding: '10px 14px', color: 'rgba(255,255,255,0.8)',
    fontFamily: 'var(--font-body)', fontSize: '0.82rem', outline: 'none', cursor: 'pointer', colorScheme: 'dark',
  }

  function reset() { setStatus('idle'); setResult(null); setError('') }

  async function sync() {
    if (!locationId) return
    setStatus('syncing'); setError(''); setResult(null)
    try {
      const res  = await fetch('/api/upload/cucinago', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: desde, to: hasta, location_id: locationId, org_id: orgId }),
      })
      const data = await res.json()
      if (!res.ok || data.error) { setError(data.error ?? `HTTP ${res.status}`); setStatus('error'); return }
      setResult(data); setStatus('success')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e)); setStatus('error')
    }
  }

  function setRange(label: string) {
    const now = new Date()
    if (label === 'Este mes') {
      setDesde(`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-01`); setHasta(today)
    } else if (label === 'Mes anterior') {
      const prev = new Date(now.getFullYear(), now.getMonth()-1, 1)
      const last = new Date(now.getFullYear(), now.getMonth(), 0)
      setDesde(prev.toISOString().slice(0,10)); setHasta(last.toISOString().slice(0,10))
    } else {
      const day  = now.getDay()
      const diff = now.getDate() - day + (day === 0 ? -6 : 1)
      setDesde(new Date(now.getFullYear(), now.getMonth(), diff).toISOString().slice(0,10)); setHasta(today)
    }
  }

  return (
    <CardShell accent={CYAN}>
      <CardHeader
        icon={<RefreshIcon size={26} spinning={status === 'syncing'} />}
        title="Sincronizar CucinaGo"
        description="Importa órdenes e ítems directamente desde la plataforma CucinaGo para el rango de fechas seleccionado."
        status={status} accent={CYAN}
      />
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        {(['Desde', 'Hasta'] as const).map(label => (
          <div key={label} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontFamily: 'var(--font-display)', fontSize: '0.6rem', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.35)' }}>{label}</label>
            <input type="date" value={label === 'Desde' ? desde : hasta}
              max={label === 'Desde' ? hasta : today} min={label === 'Hasta' ? desde : undefined}
              onChange={e => label === 'Desde' ? setDesde(e.target.value) : setHasta(e.target.value)}
              disabled={status === 'syncing'} style={inputStyle} />
          </div>
        ))}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', flex: 1, justifyContent: 'flex-end' }}>
          {['Esta semana', 'Este mes', 'Mes anterior'].map(label => (
            <button key={label} onClick={() => setRange(label)} disabled={status === 'syncing'} style={{
              padding: '6px 12px', background: 'rgba(6,182,212,0.08)', border: '1px solid rgba(6,182,212,0.2)',
              borderRadius: 6, cursor: status === 'syncing' ? 'not-allowed' : 'pointer',
              fontFamily: 'var(--font-display)', fontSize: '0.58rem', letterSpacing: '0.1em',
              textTransform: 'uppercase', color: CYAN, whiteSpace: 'nowrap',
            }}>{label}</button>
          ))}
        </div>
      </div>
      <div style={{ padding: '12px 16px', background: 'rgba(6,182,212,0.05)', border: '1px solid rgba(6,182,212,0.12)', borderRadius: 8, display: 'flex', gap: 10, alignItems: 'center' }}>
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: CYAN, boxShadow: `0 0 6px ${CYAN}`, flexShrink: 0 }} />
        <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.75rem', color: 'rgba(255,255,255,0.45)' }}>
          Órdenes del <strong style={{ color: 'rgba(255,255,255,0.7)' }}>{desde}</strong> al <strong style={{ color: 'rgba(255,255,255,0.7)' }}>{hasta}</strong> · Sucursal 2216
        </span>
      </div>
      <ResultBanner status={status} result={result} error={error} />
      <div style={{ display: 'flex', gap: 8 }}>
        <PrimaryBtn
          label={status === 'syncing' ? 'Sincronizando…' : 'Sincronizar CucinaGo'}
          onClick={sync}
          disabled={!locationId || status === 'syncing'}
          accent={CYAN}
          loading={status === 'syncing'}
        />
        {(status === 'success' || status === 'error') && <SecondaryBtn label="Limpiar" onClick={reset} />}
      </div>
    </CardShell>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function UploadPage() {
  const { locationId, orgId } = useAuth()

  return (
    <div style={{ position: 'relative', minHeight: '100vh', background: '#0a0a12' }}>
      <SceneBackground />
      <div style={{ position: 'relative', zIndex: 1, maxWidth: 900, margin: '0 auto', padding: '48px 24px 80px' }}>

        {/* Back nav */}
        <div style={{ marginBottom: 32 }}>
          <Link href="/role-select" style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, textDecoration: 'none',
            fontFamily: 'var(--font-display)', fontSize: '0.62rem', letterSpacing: '0.16em',
            textTransform: 'uppercase', color: 'rgba(255,255,255,0.28)',
          }}>
            <ArrowLeftIcon size={13} />
            Volver
          </Link>
        </div>

        {/* Header */}
        <div style={{ marginBottom: 40 }}>
          <div style={{ fontSize: 10, letterSpacing: 3, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', marginBottom: 8 }}>
            FARO<span style={{ color: AMBER }}>PULSE</span>
          </div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 'clamp(1.6rem, 3vw, 2.2rem)', letterSpacing: '0.06em', color: 'rgba(255,255,255,0.92)', margin: '0 0 10px' }}>
            Carga de Información
          </h1>
          <div style={{ width: 40, height: 2, background: AMBER, borderRadius: 1, marginBottom: 12 }} />
          <p style={{ fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: '0.88rem', color: 'rgba(255,255,255,0.38)', margin: 0 }}>
            Importá datos financieros y operativos. Los registros existentes en el rango de fechas son reemplazados.
          </p>
        </div>

        {!locationId && <NoAuthWarning />}

        {/* Cards */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <CardPnLNav />
          <CardVentas   locationId={locationId ?? ''} orgId={orgId ?? ''} />
          <CardItems    locationId={locationId ?? ''} orgId={orgId ?? ''} />
          {SHOW_CUCINAGO_SYNC && <CardCucinaGo locationId={locationId ?? ''} orgId={orgId ?? ''} />}
        </div>
      </div>

      <style>{`@keyframes faro-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
