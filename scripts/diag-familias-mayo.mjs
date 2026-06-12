/**
 * PASO 0 — Diagnóstico read-only: top familias en sales_items, mayo 2026.
 * Uso: node --env-file=.env.local scripts/diag-familias-mayo.mjs
 * NUNCA imprime keys ni partes de keys.
 */

const URL_BASE    = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const LOCATION_ID = 'bbbbbbbb-0000-0000-0000-000000000001'

if (!URL_BASE || !SERVICE_KEY) {
  console.error('[diag] ERROR: faltan variables. Usar --env-file=.env.local')
  process.exit(1)
}

console.log('[diag] URL:', URL_BASE)
console.log('[diag] location_id:', LOCATION_ID)
console.log()

const HEADERS = {
  'apikey':        SERVICE_KEY,
  'Authorization': `Bearer ${SERVICE_KEY}`,
  'Accept':        'application/json',
}

// ─── 1. Inspeccionar schema de sales_items ────────────────────────────────────

console.log('=== 1. Schema de sales_items (una fila) ===')
const sampleRes = await fetch(
  `${URL_BASE}/rest/v1/sales_items?select=*&location_id=eq.${LOCATION_ID}&limit=1`,
  { headers: HEADERS }
)
if (!sampleRes.ok) {
  const err = await sampleRes.text()
  console.error('  ERROR:', sampleRes.status, err.slice(0, 200))
  process.exit(1)
}
const [sample] = await sampleRes.json()
if (!sample) {
  console.log('  No hay filas para esta location_id')
  process.exit(0)
}
console.log('  Campos disponibles:', Object.keys(sample).join(', '))
console.log()

// ─── 2. Confirmar nombres de campos relevantes ─────────────────────────────────

const CAMPO_FAMILIA    = 'familia'     in sample ? 'familia'     : null
const CAMPO_PRECIO     = 'precio_total' in sample ? 'precio_total' : 'total' in sample ? 'total' : null
const CAMPO_CANTIDAD   = 'cantidad'    in sample ? 'cantidad'    : null
const CAMPO_FECHA_CAJA = 'fecha_caja'  in sample ? 'fecha_caja'  : 'mes_caja' in sample ? 'mes_caja' : null

console.log('=== 2. Campos detectados ===')
console.log('  familia    :', CAMPO_FAMILIA    ?? '⚠ NO ENCONTRADO')
console.log('  precio_total:', CAMPO_PRECIO    ?? '⚠ NO ENCONTRADO')
console.log('  cantidad   :', CAMPO_CANTIDAD   ?? '⚠ NO ENCONTRADO')
console.log('  fecha_caja :', CAMPO_FECHA_CAJA ?? '⚠ NO ENCONTRADO')
console.log()

if (!CAMPO_FAMILIA || !CAMPO_PRECIO || !CAMPO_FECHA_CAJA) {
  console.error('  ERROR: campos críticos ausentes — revisar schema')
  console.error('  Fila de muestra:', JSON.stringify(sample))
  process.exit(1)
}

// ─── 3. Fetch filas de mayo 2026 (paginado) ───────────────────────────────────

console.log('=== 3. Fetch sales_items mayo 2026 (service_role, paginado) ===')
const selectFields = [CAMPO_FAMILIA, CAMPO_PRECIO, CAMPO_CANTIDAD].filter(Boolean).join(',')
const PAGE = 1000
const rows = []
let offset = 0

while (true) {
  const url = `${URL_BASE}/rest/v1/sales_items` +
    `?select=${selectFields}` +
    `&location_id=eq.${LOCATION_ID}` +
    `&${CAMPO_FECHA_CAJA}=gte.2026-05-01` +
    `&${CAMPO_FECHA_CAJA}=lt.2026-06-01` +
    `&limit=${PAGE}&offset=${offset}`

  const res = await fetch(url, { headers: HEADERS })
  if (!res.ok) {
    const err = await res.text()
    console.error('  ERROR:', res.status, err.slice(0, 200))
    process.exit(1)
  }
  const page = await res.json()
  rows.push(...page)
  if (page.length < PAGE) break
  offset += PAGE
}
console.log(`  Filas totales recibidas: ${rows.length}`)
console.log()

// ─── 4. Agregar por familia ───────────────────────────────────────────────────

const agg = new Map()
let totalVentas  = 0
let totalCantidad = 0

for (const r of rows) {
  const familia = r[CAMPO_FAMILIA] ?? null
  const ventas  = Number(r[CAMPO_PRECIO]  ?? 0)
  const cant    = Number(r[CAMPO_CANTIDAD] ?? 0)
  const key     = familia ?? '__null__'

  const prev = agg.get(key) ?? { familia, ventas: 0, cantidad: 0 }
  prev.ventas   += ventas
  prev.cantidad += cant
  agg.set(key, prev)

  totalVentas   += ventas
  totalCantidad += cant
}

const sorted = [...agg.values()].sort((a, b) => b.ventas - a.ventas)

console.log('=== 4. Top familias + TOTAL (mayo 2026) ===')
console.log(`  ${'FAMILIA'.padEnd(30)} ${'VENTAS'.padStart(14)} ${'CANT'.padStart(8)}`)
console.log('  ' + '-'.repeat(56))

for (const { familia, ventas, cantidad } of sorted) {
  const label = familia === null ? '(null — sin familia)' : `"${familia}"`
  const pct   = totalVentas > 0 ? ((ventas / totalVentas) * 100).toFixed(1) : '0.0'
  console.log(`  ${label.padEnd(30)} $${String(Math.round(ventas)).padStart(13)} ${String(cantidad).padStart(8)}  (${pct}%)`)
}
console.log('  ' + '-'.repeat(56))
console.log(`  ${'TOTAL'.padEnd(30)} $${String(Math.round(totalVentas)).padStart(13)} ${String(Math.round(totalCantidad)).padStart(8)}`)
console.log()

console.log('=== SMOKE TEST ANCHOR ===')
console.log(`  Total sales_items mayo 2026 = $${Math.round(totalVentas).toLocaleString('es-AR')}`)
console.log(`  Familias distintas: ${sorted.length} (${sorted.filter(r => r.familia === null).length} con null)`)
console.log(`  Familia null viene como: ${sorted.find(r => r.familia === null) ? '"null" (campo null)' : 'no hay nulls'}`)
console.log()
