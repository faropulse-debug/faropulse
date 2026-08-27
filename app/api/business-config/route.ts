import { NextRequest, NextResponse } from 'next/server'
import { requireMembership }         from '@/lib/api-auth'
import { WRITE_ROLES }               from '@/lib/authz'
import {
  isBusinessConfigKey,
  isValidBusinessConfigValue,
  BUSINESS_CONFIG_KEYS,
  type BusinessConfigKey,
} from '@/lib/business-config'

/**
 * Escritura de configuración de negocio por location.
 *
 * Mismo criterio que /api/pnl: configurar estos números es escribir datos
 * financieros, gateado a WRITE_ROLES (owner + super_admin) vía
 * requireMembership, y persistido con service_role (bypassa RLS — la
 * defensa real contra roles no autorizados es este chequeo de acá, no la
 * RLS policy de la tabla, que es la segunda capa, no la única).
 *
 * No hay lectura acá a propósito: la lectura es la RPC
 * get_location_business_config, llamada directo desde el cliente vía
 * supabase.rpc(), igual que el resto de los datos financieros
 * (get_ventas_*, get_descuentos_*, etc.).
 */

interface WriteEntry {
  key:   string
  value: unknown
}

export async function POST(req: NextRequest) {
  const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
  const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!SUPA_URL || !SUPA_KEY) {
    console.error('[api/business-config] Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
    return NextResponse.json({ error: 'Configuración de servidor incompleta' }, { status: 500 })
  }

  const location_id = req.nextUrl.searchParams.get('location_id')
  if (!location_id) {
    return NextResponse.json({ error: 'Falta location_id (query param)' }, { status: 400 })
  }

  const authResult = await requireMembership(req, location_id, { roles: WRITE_ROLES })
  if (authResult instanceof Response) return authResult
  const { userId } = authResult

  let body: { entries?: WriteEntry[] }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Body inválido: se esperaba JSON' }, { status: 400 })
  }

  const entries = body.entries
  if (!Array.isArray(entries) || entries.length === 0) {
    return NextResponse.json({ error: 'Falta "entries": array de { key, value } no vacío' }, { status: 400 })
  }

  // Validar TODO antes de escribir nada — si una entrada es inválida, no se
  // aplica ninguna (evita escrituras parciales de un batch mal formado).
  for (const entry of entries) {
    if (typeof entry.key !== 'string' || !isBusinessConfigKey(entry.key)) {
      return NextResponse.json(
        { error: `Clave desconocida: "${entry.key}". Claves válidas: ${Object.keys(BUSINESS_CONFIG_KEYS).join(', ')}` },
        { status: 400 },
      )
    }
    if (!isValidBusinessConfigValue(entry.key, entry.value)) {
      return NextResponse.json(
        { error: `Valor inválido para "${entry.key}" (unidad ${BUSINESS_CONFIG_KEYS[entry.key].unit}): ${JSON.stringify(entry.value)}` },
        { status: 400 },
      )
    }
  }

  const nowIso = new Date().toISOString()
  const rows = (entries as { key: BusinessConfigKey; value: unknown }[]).map(e => ({
    location_id,
    key:        e.key,
    value:      e.value,
    unit:       BUSINESS_CONFIG_KEYS[e.key].unit,
    updated_at: nowIso,
    updated_by: userId,
  }))

  try {
    const upsertRes = await fetch(
      `${SUPA_URL}/rest/v1/location_business_config?on_conflict=location_id,key`,
      {
        method:  'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey':       SUPA_KEY,
          'Authorization': `Bearer ${SUPA_KEY}`,
          'Prefer':       'resolution=merge-duplicates,return=minimal',
        },
        body: JSON.stringify(rows),
      },
    )
    if (!upsertRes.ok) {
      const text = await upsertRes.text()
      throw new Error(`UPSERT falló status=${upsertRes.status}: ${text}`)
    }

    return NextResponse.json({ success: true, upserted: rows.map(r => r.key) })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[api/business-config] error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
