'use client'

import { useState, useRef, useCallback } from 'react'
import { TABLE_SCHEMAS, type TableType, type ValidationResult, type ValidationError } from '@/lib/validators/uploadValidator'
import type { DuplicateInfo, InsertMode } from '@/lib/processors/excelProcessor'
import { StatusBadge, type ZoneStatus } from './StatusBadge'
import { ProgressBar } from './ProgressBar'
import { ErrorTable } from './ErrorTable'
import { PreviewTable } from './PreviewTable'

export type { ZoneStatus }

export interface ZoneState {
  status:     ZoneStatus
  file:       File | null
  validation: ValidationResult | null
  duplicates: DuplicateInfo | null
  step:       string
  inserted:   number
  total:      number
  error:      string
}

export const INITIAL_ZONE: ZoneState = {
  status: 'idle', file: null, validation: null, duplicates: null,
  step: '', inserted: 0, total: 0, error: '',
}

const AMBER     = '#f5820a'
const AMBER_DIM = 'rgba(245,130,10,0.15)'
const GREEN     = '#22c55e'
const RED       = '#ef4444'
const CARD_BG   = 'rgba(255,255,255,0.03)'
const CARD_BORDER = 'rgba(255,255,255,0.07)'

const TABLE_ICONS: Record<TableType, string> = {
  ventas: '🧾', stock: '📦', precios: '🏷️', financial: '📊',
}
const TABLE_ACCENT: Record<TableType, string> = {
  ventas: '#f5820a', stock: '#64a0f0', precios: '#a78bfa', financial: '#22c55e',
}

function UploadIcon({ size = 24, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" />
    </svg>
  )
}
function CheckIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={GREEN} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}
function XIcon({ size = 16, color = RED }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )
}

export interface UploadZoneProps {
  tableType: TableType
  state:     ZoneState
  onFile:    (file: File) => void
  onConfirm: (mode: InsertMode) => void
  onReset:   () => void
}

export function UploadZone({ tableType, state, onFile, onConfirm, onReset }: UploadZoneProps) {
  const schema   = TABLE_SCHEMAS[tableType]
  const required = schema.columns.filter(c => c.required)
  const optional = schema.columns.filter(c => !c.required)
  const accent   = TABLE_ACCENT[tableType]
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const pct       = state.total > 0 ? (state.inserted / state.total) * 100 : 0
  const isLoading = ['reading', 'validating', 'duplicate_check', 'inserting'].includes(state.status)

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragging(false)
    const f = e.dataTransfer.files[0]
    if (f) onFile(f)
  }, [onFile])

  return (
    <div style={{
      position: 'relative',
      background: CARD_BG,
      border: `1px solid ${
        state.status === 'error'   ? RED + '44'   :
        state.status === 'success' ? GREEN + '44' :
        state.status === 'preview' || state.status === 'duplicate_warning' ? accent + '44' :
        CARD_BORDER
      }`,
      borderRadius: '16px', backdropFilter: 'blur(20px)', padding: '24px', overflow: 'hidden',
      transition: 'border-color 0.2s',
    }}>
      {/* Top accent line */}
      <div style={{ position: 'absolute', top: 0, left: '15%', right: '15%', height: '1px', background: `linear-gradient(90deg, transparent, ${accent}, transparent)`, opacity: 0.5 }} />

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '1.2rem' }}>{TABLE_ICONS[tableType]}</span>
          <div>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.72rem', letterSpacing: '0.18em', textTransform: 'uppercase', color: accent }}>
              {schema.label.split('(')[0].trim()}
            </div>
            <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.63rem', color: 'rgba(255,255,255,0.3)' }}>
              {schema.label.match(/\(([^)]+)\)/)?.[1]}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <StatusBadge status={state.status} />
          {state.status !== 'idle' && !isLoading && (
            <button onClick={onReset} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.3)', padding: '2px', display: 'flex' }} title="Reiniciar">
              <XIcon size={14} color="rgba(255,255,255,0.35)" />
            </button>
          )}
        </div>
      </div>

      {/* Columns reference */}
      <div style={{ marginBottom: '16px', display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
        {required.map(c => (
          <span key={c.name} style={{
            fontFamily: 'monospace', fontSize: '0.6rem', padding: '2px 6px',
            background: `${accent}18`, border: `1px solid ${accent}40`,
            borderRadius: '3px', color: accent,
          }}>{c.name}</span>
        ))}
        {optional.slice(0, 6).map(c => (
          <span key={c.name} style={{
            fontFamily: 'monospace', fontSize: '0.6rem', padding: '2px 6px',
            background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)',
            borderRadius: '3px', color: 'rgba(255,255,255,0.3)',
          }}>{c.name}</span>
        ))}
        {optional.length > 6 && (
          <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.6rem', color: 'rgba(255,255,255,0.2)', padding: '2px 4px' }}>
            +{optional.length - 6} opcionales
          </span>
        )}
      </div>

      {/* Drop zone */}
      {state.status === 'idle' && (
        <div
          onDragOver={e => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          style={{
            border: `1.5px dashed ${dragging ? accent : 'rgba(255,255,255,0.12)'}`,
            borderRadius: '10px', padding: '28px 16px',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px',
            cursor: 'pointer', transition: 'all 0.15s',
            background: dragging ? `${accent}08` : 'transparent',
          }}
        >
          <UploadIcon size={28} color={dragging ? accent : 'rgba(255,255,255,0.2)'} />
          <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.8rem', color: 'rgba(255,255,255,0.45)', textAlign: 'center' }}>
            Arrastrá tu archivo o{' '}
            <span style={{ color: accent, fontWeight: 600 }}>hacé clic para seleccionar</span>
          </div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: '0.58rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.2)' }}>
            .xlsx o .csv
          </div>
          <input ref={inputRef} type="file" accept=".xlsx,.csv" style={{ display: 'none' }}
            onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f) }} />
        </div>
      )}

      {/* Loading state */}
      {isLoading && (
        <div style={{ padding: '16px 0' }}>
          <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.78rem', color: 'rgba(255,255,255,0.55)', marginBottom: '10px' }}>
            {state.step}
          </div>
          <ProgressBar pct={state.status === 'inserting' ? pct : 40} />
          {state.status === 'inserting' && state.total > 0 && (
            <div style={{ marginTop: '6px', fontFamily: 'var(--font-body)', fontSize: '0.65rem', color: 'rgba(255,255,255,0.3)' }}>
              {state.inserted.toLocaleString()} / {state.total.toLocaleString()} filas
            </div>
          )}
        </div>
      )}

      {/* Error state */}
      {state.status === 'error' && (
        <div style={{ marginTop: '4px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', background: 'rgba(239,68,68,0.08)', borderLeft: `2px solid ${RED}`, borderRadius: '0 8px 8px 0', padding: '10px 12px' }}>
            <XIcon size={14} />
            <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.75rem', color: 'rgba(255,255,255,0.7)', whiteSpace: 'pre-line' }}>{state.error}</div>
          </div>
          {state.validation && state.validation.dataErrors.length > 0 && (
            <ErrorTable errors={state.validation.dataErrors} warnings={state.validation.warnings} />
          )}
          {state.validation && state.validation.warnings.length > 0 && state.validation.dataErrors.length === 0 && (
            <ErrorTable errors={[]} warnings={state.validation.warnings} />
          )}
        </div>
      )}

      {/* Duplicate warning */}
      {state.status === 'duplicate_warning' && state.duplicates && state.validation && (
        <div style={{ marginTop: '4px' }}>
          <div style={{ background: 'rgba(245,158,11,0.08)', borderLeft: '2px solid #f59e0b', borderRadius: '0 8px 8px 0', padding: '12px 14px', marginBottom: '14px' }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '0.62rem', letterSpacing: '0.15em', textTransform: 'uppercase', color: '#f59e0b', marginBottom: '4px' }}>Duplicados detectados</div>
            <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.78rem', color: 'rgba(255,255,255,0.65)' }}>
              Ya existen <strong style={{ color: 'rgba(255,255,255,0.9)' }}>{state.duplicates.count.toLocaleString()} registros</strong> del período <strong style={{ color: 'rgba(255,255,255,0.9)' }}>{state.duplicates.range}</strong>. ¿Qué querés hacer?
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button onClick={() => onConfirm('replace')} style={{
              flex: 1, minWidth: '120px', padding: '10px 16px',
              background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.4)',
              borderRadius: '8px', cursor: 'pointer', fontFamily: 'var(--font-display)',
              fontSize: '0.62rem', letterSpacing: '0.15em', textTransform: 'uppercase', color: RED,
            }}>Reemplazar todo</button>
            <button onClick={() => onConfirm('add')} style={{
              flex: 1, minWidth: '120px', padding: '10px 16px',
              background: `${accent}18`, border: `1px solid ${accent}55`,
              borderRadius: '8px', cursor: 'pointer', fontFamily: 'var(--font-display)',
              fontSize: '0.62rem', letterSpacing: '0.15em', textTransform: 'uppercase', color: accent,
            }}>Solo agregar nuevos</button>
          </div>
          {state.validation.warnings.length > 0 && (
            <ErrorTable errors={[]} warnings={state.validation.warnings} />
          )}
        </div>
      )}

      {/* Preview */}
      {state.status === 'preview' && state.validation && (
        <div style={{ marginTop: '4px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
            <CheckIcon size={14} />
            <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.78rem', color: 'rgba(255,255,255,0.7)' }}>
              Se van a insertar <strong style={{ color: 'rgba(255,255,255,0.92)' }}>{state.validation.rows.length.toLocaleString()} filas</strong> — {state.file?.name}
            </span>
          </div>
          {state.validation.warnings.length > 0 && (
            <ErrorTable errors={[]} warnings={state.validation.warnings} />
          )}
          <PreviewTable rows={state.validation.rows} headers={state.validation.headers} />
          <div style={{ display: 'flex', gap: '8px', marginTop: '14px', flexWrap: 'wrap' }}>
            <button onClick={() => onConfirm('add')} style={{
              flex: 1, minWidth: '140px', padding: '11px 20px',
              background: `linear-gradient(135deg, ${accent}, #fba94c)`,
              border: 'none', borderRadius: '8px', cursor: 'pointer',
              fontFamily: 'var(--font-display)', fontSize: '0.65rem', letterSpacing: '0.18em',
              textTransform: 'uppercase', color: '#000', fontWeight: 700,
              boxShadow: `0 4px 20px rgba(245,130,10,0.3)`,
            }}>Confirmar carga</button>
            <button onClick={onReset} style={{
              padding: '11px 16px',
              background: 'transparent', border: '1px solid rgba(255,255,255,0.15)',
              borderRadius: '8px', cursor: 'pointer',
              fontFamily: 'var(--font-display)', fontSize: '0.62rem', letterSpacing: '0.15em',
              textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)',
            }}>Cancelar</button>
          </div>
        </div>
      )}

      {/* Success */}
      {state.status === 'success' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 0' }}>
          <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'rgba(34,197,94,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <CheckIcon size={16} />
          </div>
          <div>
            <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.82rem', color: GREEN, fontWeight: 600 }}>
              Carga exitosa: {state.inserted.toLocaleString()} filas insertadas
            </div>
            {state.total > state.inserted && (
              <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.7rem', color: 'rgba(255,255,255,0.3)', marginTop: '2px' }}>
                {(state.total - state.inserted).toLocaleString()} filas omitidas (duplicados)
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
