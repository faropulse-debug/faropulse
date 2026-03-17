'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { validateFile, type TableType } from '@/lib/validators/uploadValidator'
import { checkDuplicates, processUpload, type InsertMode } from '@/lib/processors/excelProcessor'
import { UploadZone, type ZoneState, INITIAL_ZONE } from '@/components/upload/UploadZone'

const AMBER = '#f5820a'
const GREEN = '#22c55e'

function ArrowLeft({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" />
    </svg>
  )
}

const TABLE_TYPES: TableType[] = ['ventas', 'items', 'stock', 'precios', 'financial']

export default function UploadPage() {
  const router = useRouter()
  const { user } = useAuth()

  const locationId = user?.activeMembership?.location_id
    ?? process.env.NEXT_PUBLIC_LOCATION_ID
    ?? ''
  const orgId = user?.activeMembership?.org_id
    ?? process.env.NEXT_PUBLIC_ORG_ID
    ?? ''

  const [zones, setZones] = useState<Record<TableType, ZoneState>>({
    ventas:    { ...INITIAL_ZONE },
    items:     { ...INITIAL_ZONE },
    stock:     { ...INITIAL_ZONE },
    precios:   { ...INITIAL_ZONE },
    financial: { ...INITIAL_ZONE },
  })

  function setZone(type: TableType, patch: Partial<ZoneState>) {
    setZones(z => ({ ...z, [type]: { ...z[type], ...patch } }))
  }

  async function handleFile(type: TableType, file: File) {
    setZone(type, { file, status: 'reading', step: 'Leyendo archivo…', error: '', validation: null })

    await new Promise(r => setTimeout(r, 100))
    setZone(type, { status: 'validating', step: 'Validando formato y columnas…' })

    const validation = await validateFile(file, type)

    if (!validation.ok) {
      setZone(type, { status: 'error', error: validation.error ?? 'Error desconocido', validation })
      return
    }

    setZone(type, { status: 'duplicate_check', step: 'Verificando duplicados en la base…' })
    try {
      const duplicates = await checkDuplicates(type, validation.rows, locationId)

      if (duplicates.error) {
        console.error('[handleFile] checkDuplicates error:', duplicates.error)
        setZone(type, { status: 'error', error: `Error verificando duplicados: ${duplicates.error}` })
        return
      }

      if (duplicates.hasDuplicates) {
        setZone(type, { status: 'duplicate_warning', duplicates, validation })
      } else {
        setZone(type, { status: 'preview', validation, total: validation.rows.length })
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('[handleFile] checkDuplicates exception:', err)
      setZone(type, { status: 'error', error: `Error verificando duplicados: ${msg}` })
    }
  }

  async function handleConfirm(type: TableType, mode: InsertMode) {
    const { validation } = zones[type]
    if (!validation) return

    setZone(type, { status: 'inserting', step: `Insertando ${validation.rows.length.toLocaleString()} filas…`, inserted: 0, total: validation.rows.length })

    try {
      const result = await processUpload(
        type, validation.rows, mode,
        (inserted, total, step) => setZone(type, { inserted, total, step }),
        locationId,
        orgId,
      )

      if (result.error) {
        console.error('[handleConfirm] processUpload error:', result.error)
        setZone(type, { status: 'error', error: result.error })
      } else {
        setZone(type, { status: 'success', inserted: result.inserted, total: validation.rows.length })
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('[handleConfirm] unexpected exception:', err)
      setZone(type, { status: 'error', error: `Error inesperado: ${msg}` })
    }
  }

  function handleReset(type: TableType) {
    setZone(type, { ...INITIAL_ZONE })
  }

  const successCount = Object.values(zones).filter(z => z.status === 'success').length

  return (
    <div style={{ minHeight: '100vh', background: '#0a0c0f', fontFamily: 'var(--font-body)' }}>

      {/* ── HEADER ── */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 40,
        background: 'rgba(10,12,15,0.92)', backdropFilter: 'blur(20px)',
        borderBottom: '1px solid rgba(255,255,255,0.06)', padding: '0 32px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: '64px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <button onClick={() => router.push('/dashboard/owner')} style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'rgba(255,255,255,0.35)', fontFamily: 'var(--font-display)',
              fontSize: '0.6rem', letterSpacing: '0.15em', textTransform: 'uppercase',
              padding: '6px 0', transition: 'color 0.15s',
            }}>
              <ArrowLeft size={12} />
              Dashboard
            </button>
            <div style={{ width: '1px', height: '16px', background: 'rgba(255,255,255,0.1)' }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: AMBER, boxShadow: '0 0 8px rgba(245,130,10,0.8)' }} />
              <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1rem', letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.9)' }}>
                FARO<span style={{ color: AMBER }}>PULSE</span>
              </span>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {successCount > 0 && (
              <span style={{
                fontFamily: 'var(--font-display)', fontSize: '0.58rem', letterSpacing: '0.15em',
                textTransform: 'uppercase', color: GREEN, background: 'rgba(34,197,94,0.1)',
                border: '1px solid rgba(34,197,94,0.3)', borderRadius: '5px', padding: '3px 8px',
              }}>
                {successCount} tabla{successCount > 1 ? 's' : ''} cargada{successCount > 1 ? 's' : ''}
              </span>
            )}
            <span style={{ fontFamily: 'var(--font-display)', fontSize: '0.6rem', letterSpacing: '0.2em', textTransform: 'uppercase', color: AMBER }}>
              Cargar datos
            </span>
          </div>
        </div>
      </div>

      {/* ── CONTENT ── */}
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '40px 32px' }}>

        <div style={{ marginBottom: '40px' }}>
          <h1 style={{
            fontFamily: 'var(--font-display)', fontWeight: 600,
            fontSize: 'clamp(1.3rem, 2.5vw, 1.8rem)', letterSpacing: '0.04em',
            color: 'rgba(255,255,255,0.9)', margin: '0 0 8px',
          }}>Carga de archivos</h1>
          <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.82rem', color: 'rgba(255,255,255,0.3)', margin: 0 }}>
            Los archivos se validan antes de insertarse. No se modifica ninguna tabla hasta confirmar.
          </p>
        </div>

        <div style={{
          background: 'rgba(245,130,10,0.15)', border: `1px solid rgba(245,130,10,0.2)`,
          borderRadius: '12px', padding: '16px 20px', marginBottom: '32px',
          display: 'flex', gap: '12px', alignItems: 'flex-start',
        }}>
          <span style={{ fontSize: '1rem', flexShrink: 0, marginTop: '1px' }}>ℹ️</span>
          <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.78rem', color: 'rgba(255,255,255,0.6)', lineHeight: 1.6 }}>
            Las columnas en <span style={{ color: AMBER, fontFamily: 'monospace' }}>ámbar</span> son <strong style={{ color: 'rgba(255,255,255,0.8)' }}>obligatorias</strong>.
            Las grises son opcionales. El sistema valida formato, columnas y datos antes de insertar.
            Los encabezados del Excel deben coincidir exactamente con los nombres mostrados.
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(520px, 1fr))', gap: '20px' }}>
          {TABLE_TYPES.map(type => (
            <UploadZone
              key={type}
              tableType={type}
              state={zones[type]}
              onFile={file => handleFile(type, file)}
              onConfirm={mode => handleConfirm(type, mode)}
              onReset={() => handleReset(type)}
            />
          ))}
        </div>

        <div style={{ marginTop: '48px', paddingTop: '20px', borderTop: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.7rem', color: 'rgba(255,255,255,0.2)' }}>
            Todas las cargas quedan registradas en la tabla <code style={{ fontFamily: 'monospace', color: 'rgba(255,255,255,0.35)' }}>uploads</code>
          </span>
          <button onClick={() => router.push('/dashboard/owner')} style={{
            background: 'none', border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: '8px', padding: '8px 16px', cursor: 'pointer',
            fontFamily: 'var(--font-display)', fontSize: '0.6rem', letterSpacing: '0.15em',
            textTransform: 'uppercase', color: 'rgba(255,255,255,0.35)',
          }}>Volver al dashboard</button>
        </div>
      </div>
    </div>
  )
}
