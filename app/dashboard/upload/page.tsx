'use client'

import { useState, useRef, useCallback } from 'react'
import Link from 'next/link'
import { useAuth } from '@/hooks/useAuth'

// ── Types ─────────────────────────────────────────────────────────────────────

type CardStatus = 'idle' | 'ready' | 'syncing' | 'success' | 'error'

interface FileSlot {
  file:     File | null
  dragging: boolean
}

interface UploadResult {
  docsInserted?:  number
  itemsInserted?: number
  rowsInserted?:  number
  dateRange?:     string
  periodos?:      string[]
  rawItems?:      number
  message?:       string
}

// ── Constants ─────────────────────────────────────────────────────────────────

const AMBER      = '#f5820a'
const GREEN      = '#22c55e'
const CYAN       = '#06b6d4'
const RED        = '#ef4444'
const CARD_BG    = 'rgba(255,255,255,0.025)'
const CARD_BORDER = 'rgba(255,255,255,0.07)'

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
    idle:    { label: 'Esperando',  color: 'rgba(255,255,255,0.35)', bg: 'rgba(255,255,255,0.06)' },
    ready:   { label: 'Listo',      color: '#f59e0b',               bg: 'rgba(245,158,11,0.12)' },
    syncing: { label: 'Procesando', color: CYAN,                    bg: 'rgba(6,182,212,0.12)'  },
    success: { label: 'Completado', color: GREEN,                   bg: 'rgba(34,197,94,0.12)'  },
    error:   { label: 'Error',      color: RED,                     bg: 'rgba(239,68,68,0.12)'  },
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

function ResultBanner({ status, result, error }: { status: CardStatus; result: UploadResult | null; error: string }) {
  if (status !== 'success' && status !== 'error') return null
  const isOk  = status === 'success'
  const color = isOk ? GREEN : RED
  const bg    = isOk ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)'

  return (
    <div style={{
      padding: '12px 16px',
      background: bg, border: `1px solid ${color}30`,
      borderRadius: 8, display: 'flex', alignItems: 'flex-start', gap: 10,
    }}>
      <div style={{ width: 8, height: 8, borderRadius: '50%', background: color, marginTop: 5, flexShrink: 0, boxShadow: `0 0 6px ${color}` }} />
      <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.78rem', color: 'rgba(255,255,255,0.65)', lineHeight: 1.55 }}>
        {isOk ? (
          <>
            {result?.docsInserted  != null && <div>✓ <strong style={{ color: 'rgba(255,255,255,0.85)' }}>{result.docsInserted.toLocaleString()}</strong> documentos insertados</div>}
            {result?.itemsInserted != null && <div>✓ <strong style={{ color: 'rgba(255,255,255,0.85)' }}>{result.itemsInserted.toLocaleString()}</strong> ítems insertados</div>}
            {result?.rowsInserted  != null && <div>✓ <strong style={{ color: 'rgba(255,255,255,0.85)' }}>{result.rowsInserted.toLocaleString()}</strong> filas insertadas</div>}
            {result?.dateRange     != null && <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.72rem' }}>Rango: {result.dateRange}</div>}
            {result?.periodos      != null && <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.72rem' }}>Períodos: {result.periodos.join(', ')}</div>}
            {result?.message       != null && <div>{result.message}</div>}
          </>
        ) : (
          <div style={{ color: '#fca5a5' }}>{error}</div>
        )}
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

// ── Card A: P&L ───────────────────────────────────────────────────────────────

function CardPnL({ locationId, orgId }: { locationId: string; orgId: string }) {
  const [slot,    setSlot]    = useState<FileSlot>({ file: null, dragging: false })
  const [status,  setStatus]  = useState<CardStatus>('idle')
  const [result,  setResult]  = useState<UploadResult | null>(null)
  const [error,   setError]   = useState('')

  const ready    = !!slot.file && status !== 'syncing'
  const cardStatus: CardStatus = status !== 'idle' ? status : slot.file ? 'ready' : 'idle'

  function reset() { setSlot({ file: null, dragging: false }); setStatus('idle'); setResult(null); setError('') }

  async function process() {
    if (!slot.file || !locationId) return
    setStatus('syncing'); setError(''); setResult(null)
    try {
      const form = new FormData()
      form.append('financial',   slot.file)
      form.append('location_id', locationId)
      form.append('org_id',      orgId)
      const res  = await fetch('/api/upload/financial', { method: 'POST', body: form })
      const data = await res.json()
      if (!res.ok || data.error) { setError(data.error ?? `HTTP ${res.status}`); setStatus('error'); return }
      setResult(data); setStatus('success')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e)); setStatus('error')
    }
  }

  return (
    <CardShell accent={AMBER}>
      <CardHeader
        icon={<SpreadsheetIcon size={26} />}
        title="Cargar P&L"
        description="Estado de Resultados mensual. Formato pivot: meses en columnas, conceptos en filas."
        status={cardStatus} accent={AMBER}
      />
      <DropZone label="Excel de P&L" file={slot.file} dragging={slot.dragging} disabled={status === 'syncing'}
        onFile={f => { setSlot(s => ({ ...s, file: f })); setStatus('idle') }}
        onDragEnter={() => setSlot(s => ({ ...s, dragging: true }))}
        onDragLeave={() => setSlot(s => ({ ...s, dragging: false }))}
        accent={AMBER} />
      <ResultBanner status={status} result={result} error={error} />
      {(slot.file || status !== 'idle') && (
        <div style={{ display: 'flex', gap: 8 }}>
          <PrimaryBtn label={status === 'syncing' ? 'Procesando…' : 'Procesar P&L'} onClick={process}
            disabled={!ready || !locationId} accent={AMBER} loading={status === 'syncing'} />
          <SecondaryBtn label="Limpiar" onClick={reset} />
        </div>
      )}
    </CardShell>
  )
}

// ── Card B: Ventas + Items ────────────────────────────────────────────────────

function CardVentasItems({ locationId, orgId }: { locationId: string; orgId: string }) {
  const [ventas,  setVentas]  = useState<FileSlot>({ file: null, dragging: false })
  const [items,   setItems]   = useState<FileSlot>({ file: null, dragging: false })
  const [status,  setStatus]  = useState<CardStatus>('idle')
  const [result,  setResult]  = useState<UploadResult | null>(null)
  const [error,   setError]   = useState('')

  const ready    = !!ventas.file && !!items.file && status !== 'syncing'
  const cardStatus: CardStatus = status !== 'idle' ? status : (ventas.file && items.file) ? 'ready' : 'idle'

  function reset() {
    setVentas({ file: null, dragging: false }); setItems({ file: null, dragging: false })
    setStatus('idle'); setResult(null); setError('')
  }

  async function process() {
    if (!ventas.file || !items.file || !locationId) return
    setStatus('syncing'); setError(''); setResult(null)
    try {
      const form = new FormData()
      form.append('ventas',      ventas.file)
      form.append('items',       items.file)
      form.append('location_id', locationId)
      form.append('org_id',      orgId)
      const res  = await fetch('/api/upload/sales', { method: 'POST', body: form })
      const data = await res.json()
      if (!res.ok || data.error) { setError(data.error ?? `HTTP ${res.status}`); setStatus('error'); return }
      setResult(data); setStatus('success')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e)); setStatus('error')
    }
  }

  const disabled = status === 'syncing'

  return (
    <CardShell accent="#fb923c">
      <CardHeader
        icon={<ReceiptIcon size={26} />}
        title="Cargar Ventas + Ítems"
        description="Exportaciones del sistema POS. Cargá el reporte de ventas y el detalle de ítems del período."
        status={cardStatus} accent="#fb923c"
      />
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 200px', display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontFamily: 'var(--font-display)', fontSize: '0.6rem', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.35)' }}>Archivo de Ventas</span>
          <DropZone label="Excel de ventas" file={ventas.file} dragging={ventas.dragging} disabled={disabled}
            onFile={f => { setVentas(s => ({ ...s, file: f })); setStatus('idle') }}
            onDragEnter={() => setVentas(s => ({ ...s, dragging: true }))}
            onDragLeave={() => setVentas(s => ({ ...s, dragging: false }))}
            accent="#fb923c" />
        </div>
        <div style={{ flex: '1 1 200px', display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontFamily: 'var(--font-display)', fontSize: '0.6rem', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.35)' }}>Archivo de Ítems</span>
          <DropZone label="Excel de ítems" file={items.file} dragging={items.dragging} disabled={disabled}
            onFile={f => { setItems(s => ({ ...s, file: f })); setStatus('idle') }}
            onDragEnter={() => setItems(s => ({ ...s, dragging: true }))}
            onDragLeave={() => setItems(s => ({ ...s, dragging: false }))}
            accent="#fb923c" />
        </div>
      </div>
      <ResultBanner status={status} result={result} error={error} />
      {(ventas.file || items.file || status !== 'idle') && (
        <div style={{ display: 'flex', gap: 8 }}>
          <PrimaryBtn
            label={status === 'syncing' ? 'Procesando…' : 'Procesar Ventas'}
            onClick={process}
            disabled={!ready || !locationId}
            accent="#fb923c"
            loading={status === 'syncing'}
          />
          <SecondaryBtn label="Limpiar" onClick={reset} />
        </div>
      )}
    </CardShell>
  )
}

// ── Card C: CucinaGo ──────────────────────────────────────────────────────────

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
  const { user } = useAuth()

  const locationId = user?.activeMembership?.location_id ?? ''
  const orgId      = user?.activeMembership?.org_id      ?? ''

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
          <CardPnL          locationId={locationId} orgId={orgId} />
          <CardVentasItems  locationId={locationId} orgId={orgId} />
          <CardCucinaGo     locationId={locationId} orgId={orgId} />
        </div>
      </div>

      <style>{`@keyframes faro-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
