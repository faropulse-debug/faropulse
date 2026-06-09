import { NextRequest, NextResponse } from 'next/server'
import { computePnL, type PnLInputs } from '@/lib/pnl/formulas'

interface FinRow {
  org_id:      string
  location_id: string
  periodo:     string
  categoria:   string
  concepto:    string
  monto:       number
}

function buildRows(inputs: PnLInputs, orgId: string, locationId: string, periodo: string): FinRow[] {
  const c = computePnL(inputs)

  const r = (categoria: string, concepto: string, monto: number): FinRow => ({
    org_id: orgId, location_id: locationId, periodo, categoria, concepto,
    monto: parseFloat(monto.toFixed(2)),
  })

  return [
    // VENTAS — primarios
    r('VENTAS', 'VENTAS_SALON', inputs.ventas_salon),
    r('VENTAS', 'VENTAS_DELY',  inputs.ventas_dely),
    // VENTAS — calculado (VENTAS_NOCHE = total ventas)
    r('VENTAS', 'VENTAS_NOCHE', c.total_ventas),

    // VOLUMEN — primarios
    r('VOLUMEN', 'TICKETS_SALON',     inputs.tickets_salon),
    r('VOLUMEN', 'TICKETS_TAKEAWAY',  inputs.tickets_takeaway),
    r('VOLUMEN', 'TICKETS_DELY',      inputs.tickets_dely),

    // COSTOS VARIABLES — primarios
    r('COSTOS', 'PROTEINAS',        inputs.proteinas),
    r('COSTOS', 'LACTEOS_FIAMBRES', inputs.lacteos_fiambres),
    r('COSTOS', 'ALMACEN',          inputs.almacen),
    r('COSTOS', 'POSTRES_CAFE',     inputs.postres_cafe),
    r('COSTOS', 'PASTAS_EMPANADAS', inputs.pastas_empanadas),
    r('COSTOS', 'VERDURAS',         inputs.verduras),
    r('COSTOS', 'BOLLOS',           inputs.bollos),
    r('COSTOS', 'PORCION_MUZZA',    inputs.porcion_muzza),
    r('COSTOS', 'DESCARTABLE',      inputs.descartable),
    r('COSTOS', 'BEBIDAS',          inputs.bebidas),
    r('COSTOS', 'QUILMES',          inputs.quilmes),
    r('COSTOS', 'LIMPIEZA',         inputs.limpieza),
    // COSTOS — calculado
    r('COSTOS', 'TOTAL_COSTOS', c.total_costos),

    // GASTOS FIJOS — primarios
    r('GASTOS', 'SUELDOS_CARGAS', inputs.sueldos_cargas),
    r('GASTOS', 'LIQ_FINAL',      inputs.liq_final),
    r('GASTOS', 'ALQUILER',       inputs.alquiler),
    r('GASTOS', 'SERVICIOS',      inputs.servicios),
    r('GASTOS', 'HONORARIOS',     inputs.honorarios),
    r('GASTOS', 'GASTOS_VARIOS',  inputs.gastos_varios),
    r('GASTOS', 'MANTENIMIENTO',  inputs.mantenimiento),
    r('GASTOS', 'IMPUESTOS',      inputs.impuestos),
    r('GASTOS', 'TARJETAS',       inputs.tarjetas),
    r('GASTOS', 'APP_DELY',       inputs.app_dely),
    r('GASTOS', 'GS_BANCARIOS',   inputs.gs_bancarios),
    // GASTOS — calculado
    r('GASTOS', 'TOTAL_GASTOS', c.total_gastos),

    // REGALIAS — calculado
    r('REGALIAS', 'REGALIAS', c.regalias),

    // RESULTADO — calculado
    r('RESULTADO', 'RESULTADO_NETO', c.resultado_neto),
  ]
}

export async function POST(req: NextRequest) {
  const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
  const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!SUPA_URL || !SUPA_KEY) {
    console.error('[api/pnl] Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
    return NextResponse.json({ error: 'Configuración de servidor incompleta' }, { status: 500 })
  }

  const SVC = {
    'Content-Type':  'application/json',
    'apikey':        SUPA_KEY,
    'Authorization': `Bearer ${SUPA_KEY}`,
    'Prefer':        'return=minimal',
  }

  try {
    const body = await req.json() as {
      periodo:     string
      location_id: string
      org_id:      string
      inputs:      PnLInputs
    }

    const { periodo, location_id, org_id, inputs } = body

    if (!periodo || !location_id || !org_id || !inputs) {
      return NextResponse.json({ error: 'Faltan campos requeridos: periodo, location_id, org_id, inputs' }, { status: 400 })
    }
    if (!/^\d{4}-\d{2}$/.test(periodo)) {
      return NextResponse.json({ error: 'Formato de periodo inválido (esperado YYYY-MM)' }, { status: 400 })
    }

    const rows = buildRows(inputs, org_id, location_id, periodo)

    // Idempotente: DELETE then INSERT
    console.log(`[api/pnl] DELETE financial_results periodo=${periodo} location_id=${location_id}`)
    const delRes = await fetch(
      `${SUPA_URL}/rest/v1/financial_results?location_id=eq.${location_id}&periodo=eq.${periodo}`,
      { method: 'DELETE', headers: SVC },
    )
    if (!delRes.ok) {
      const text = await delRes.text()
      throw new Error(`DELETE falló status=${delRes.status}: ${text}`)
    }

    console.log(`[api/pnl] INSERT financial_results rows=${rows.length}`)
    const insRes = await fetch(`${SUPA_URL}/rest/v1/financial_results`, {
      method:  'POST',
      headers: SVC,
      body:    JSON.stringify(rows),
    })
    if (!insRes.ok) {
      const text = await insRes.text()
      throw new Error(`INSERT falló status=${insRes.status}: ${text}`)
    }

    return NextResponse.json({ success: true, rowsInserted: rows.length, periodo })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[api/pnl] error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
