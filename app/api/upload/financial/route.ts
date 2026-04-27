import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const BATCH    = 500

const SVC = {
  'Content-Type':  'application/json',
  'apikey':        SUPA_KEY,
  'Authorization': `Bearer ${SUPA_KEY}`,
  'Prefer':        'return=minimal',
}

// ─── Concepto → Categoría map ─────────────────────────────────────────────────
// Maps exact concepto keys (as they appear in the Excel row labels) to DB categoria.
// Keys should match what Pizzería Popular uses in their P&L spreadsheet.

const CATEGORIA_MAP: Record<string, string> = {
  VENTAS_NOCHE:    'VENTAS',
  VENTAS_BRUTA:    'VENTAS',
  VENTAS:          'VENTAS',
  TOTAL_COSTOS:    'COSTOS',
  COSTOS_VARIABLES:'COSTOS',
  CV:              'COSTOS',
  SUELDOS_CARGAS:  'SUELDOS',
  SUELDOS:         'SUELDOS',
  LIQ_FINAL:       'SUELDOS',
  LIQUIDACIONES:   'SUELDOS',
  CARGAS_SOCIALES: 'SUELDOS',
  TOTAL_GASTOS:    'GASTOS',
  GASTOS_FIJOS:    'GASTOS',
  SERVICIOS:       'GASTOS',
  ALQUILER:        'GASTOS',
  REGALIAS:        'GASTOS',
  PUBLICIDAD:      'GASTOS',
  MANTENIMIENTO:   'GASTOS',
  RESULTADO_NETO:  'RESULTADOS',
  RESULTADO:       'RESULTADOS',
  UTILIDAD:        'RESULTADOS',
  GANANCIA:        'RESULTADOS',
}

const MES_TO_NUM: Record<string, string> = {
  ene: '01', jan: '01', feb: '02', mar: '03', abr: '04', apr: '04',
  may: '05', jun: '06', jul: '07', ago: '08', aug: '08', sep: '09',
  oct: '10', nov: '11', dic: '12', dec: '12',
}

// ─── Period label parser ───────────────────────────────────────────────────────
// Converts "Ene 25", "Ene-25", "enero 2025", "2025-01", "01/2025" → "YYYY-MM"

function parsePeriodoLabel(label: string): string | null {
  const s = String(label).trim().toLowerCase()

  // YYYY-MM
  if (/^\d{4}-\d{2}$/.test(s)) return s

  // "Ene 25" / "Ene-25" / "Ene25"
  const m1 = /^([a-záéíóú]{3})[^a-z]*(\d{2})$/.exec(s)
  if (m1) {
    const mesNum = MES_TO_NUM[m1[1]]
    if (mesNum) {
      const yr = Number(m1[2]) >= 25 ? `20${m1[2]}` : `20${m1[2]}`
      return `${yr}-${mesNum}`
    }
  }

  // "Enero 2025" / "Enero-2025"
  const m2 = /^([a-záéíóú]{3,})[^a-z]*(\d{4})$/.exec(s)
  if (m2) {
    const mesNum = MES_TO_NUM[m2[1].slice(0, 3)]
    if (mesNum) return `${m2[2]}-${mesNum}`
  }

  // "01/2025" or "1/2025"
  const m3 = /^(\d{1,2})\/(\d{4})$/.exec(s)
  if (m3) return `${m3[2]}-${m3[1].padStart(2, '0')}`

  return null
}

// ─── Excel parser ─────────────────────────────────────────────────────────────
// P&L format: row 0 = headers (concepto, Ene-25, Feb-25, ...)
//             row 1+ = data rows, col 0 = concepto label, cols 1+ = montos

interface FinRow {
  periodo:   string
  categoria: string
  concepto:  string
  monto:     number
  org_id:    string
  location_id: string
}

function parsePnL(buf: ArrayBuffer, orgId: string, locationId: string): { rows: FinRow[]; periodos: string[] } {
  const wb    = XLSX.read(new Uint8Array(buf), { type: 'array', cellDates: false })
  const sheet = wb.Sheets[wb.SheetNames[0]]

  // Get raw array with header: false so we can inspect row 0 manually
  const raw = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' })
  if (raw.length < 2) return { rows: [], periodos: [] }

  const headerRow = raw[0] as unknown[]

  // Identify which columns are period columns (index → periodo string)
  const periodoByCol: Map<number, string> = new Map()
  for (let c = 1; c < headerRow.length; c++) {
    const p = parsePeriodoLabel(String(headerRow[c]))
    if (p) periodoByCol.set(c, p)
  }

  const periodos = [...new Set(periodoByCol.values())].sort()
  const rows: FinRow[] = []

  for (let r = 1; r < raw.length; r++) {
    const dataRow = raw[r] as unknown[]
    const conceptoRaw = String(dataRow[0] ?? '').trim()
    if (!conceptoRaw) continue

    // Normalize concepto: strip accents, uppercase, spaces→underscore
    const concepto = conceptoRaw
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toUpperCase().replace(/\s+/g, '_')

    // Skip rows that look like category headers (all-caps single word with no numeric values)
    const hasAnyValue = [...periodoByCol.keys()].some(c => {
      const v = Number(String(dataRow[c] ?? '').replace(',', '.').replace(/\s/g, ''))
      return !isNaN(v) && v !== 0
    })
    if (!hasAnyValue) continue

    const categoria = CATEGORIA_MAP[concepto] ?? 'OTROS'

    for (const [col, periodo] of periodoByCol) {
      const raw = String(dataRow[col] ?? '').trim().replace(/\$/g, '').replace(/\./g, '').replace(',', '.')
      const monto = parseFloat(raw)
      if (isNaN(monto) || monto === 0) continue

      rows.push({ org_id: orgId, location_id: locationId, periodo, categoria, concepto, monto })
    }
  }

  return { rows, periodos }
}

// ─── Route ────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData()

    const pnlFile    = form.get('financial')   as File   | null
    const locationId = form.get('location_id') as string | null
    const orgId      = form.get('org_id')      as string | null

    if (!pnlFile || !locationId || !orgId) {
      return NextResponse.json({ error: 'Faltan campos: financial, location_id, org_id' }, { status: 400 })
    }

    const buf               = await pnlFile.arrayBuffer()
    const { rows, periodos } = parsePnL(buf, orgId, locationId)

    if (rows.length === 0) {
      return NextResponse.json({ error: 'No se encontraron filas válidas en el Excel de P&L. Verificá que la hoja tenga meses como encabezados de columna y conceptos como filas.' }, { status: 400 })
    }

    // DELETE existing periods
    for (const periodo of periodos) {
      const res = await fetch(
        `${SUPA_URL}/rest/v1/financial_results?location_id=eq.${locationId}&periodo=eq.${periodo}`,
        { method: 'DELETE', headers: SVC },
      )
      if (!res.ok) {
        const text = await res.text()
        throw new Error(`DELETE financial_results (${periodo}): ${text}`)
      }
    }

    // INSERT in batches
    let rowsInserted = 0
    for (let i = 0; i < rows.length; i += BATCH) {
      const batch = rows.slice(i, i + BATCH)
      const res   = await fetch(`${SUPA_URL}/rest/v1/financial_results`, {
        method: 'POST', headers: SVC,
        body: JSON.stringify(batch),
      })
      if (!res.ok) {
        const text = await res.text()
        throw new Error(`INSERT financial_results (batch ${Math.floor(i/BATCH)+1}): ${text}`)
      }
      rowsInserted += batch.length
    }

    return NextResponse.json({ success: true, rowsInserted, periodos })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[upload/financial] error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
