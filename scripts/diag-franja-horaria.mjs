// Diagnóstico: campos de hora y distribución por franja — mayo 2026, STG
// Uso: node --env-file=.env.local scripts/diag-franja-horaria.mjs
// NUNCA imprime keys — sólo usa process.env internamente.

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const ANON_KEY     = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const LOCATION_ID  = 'bbbbbbbb-0000-0000-0000-000000000001'

if (!SUPABASE_URL || !ANON_KEY) {
  console.error('Faltan variables NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY')
  process.exit(1)
}

async function fetchJson(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { 'apikey': ANON_KEY, 'Authorization': `Bearer ${ANON_KEY}` },
  })
  if (!res.ok) { console.error('HTTP', res.status, await res.text()); process.exit(1) }
  return res.json()
}

// ── 1. Columnas disponibles en sales_documents (sample de 5 filas mayo 2026) ──
console.log('\n═══ MUESTRA 5 FILAS MAYO 2026 (todos los campos de hora) ═══')
const sample = await fetchJson(
  `sales_documents?select=fecha,fecha_inicio,fecha_cierre,hora,total&location_id=eq.${LOCATION_ID}&fecha=gte.2026-05-01&fecha=lt.2026-06-01&limit=5`
)
console.table(sample.map(r => ({
  fecha:        r.fecha,
  fecha_inicio: r.fecha_inicio,
  fecha_cierre: r.fecha_cierre,
  hora:         r.hora,
  total:        r.total,
})))

// ── 2. Cobertura de cada campo en mayo 2026 ────────────────────────────────────
console.log('\n═══ COBERTURA DE CAMPOS (mayo 2026, n=691) ═══')
const all = await fetchJson(
  `sales_documents?select=fecha,fecha_inicio,fecha_cierre,hora,total&location_id=eq.${LOCATION_ID}&fecha=gte.2026-05-01&fecha=lt.2026-06-01&limit=5000`
)
console.log(`Total filas: ${all.length}`)
const nullFechaInicio = all.filter(r => !r.fecha_inicio).length
const nullFechaCierre = all.filter(r => !r.fecha_cierre).length
const nullHora        = all.filter(r => r.hora === null || r.hora === undefined).length
const emptyHora       = all.filter(r => r.hora === '').length
console.log(`fecha_inicio nulls: ${nullFechaInicio} / ${all.length}`)
console.log(`fecha_cierre nulls: ${nullFechaCierre} / ${all.length}`)
console.log(`hora nulls:         ${nullHora} / ${all.length}`)
console.log(`hora empty string:  ${emptyHora} / ${all.length}`)

// ── 3. Distribución de formatos del campo hora ─────────────────────────────────
console.log('\n═══ FORMATOS DISTINTOS DE hora (primeros 20 valores únicos) ═══')
const horaValues = [...new Set(all.map(r => r.hora))].slice(0, 20)
console.log(horaValues)

// ── 4. Distribución por hora (EXTRACT de fecha_inicio vs hora string) ──────────
console.log('\n═══ DISTRIBUCIÓN POR HORA — desde fecha_inicio ═══')
const byHourFechaInicio = {}
for (const r of all) {
  if (!r.fecha_inicio) continue
  const h = new Date(r.fecha_inicio).getUTCHours()  // UTC from ISO
  byHourFechaInicio[h] = (byHourFechaInicio[h] || 0) + 1
}
for (let h = 0; h < 24; h++) {
  if (byHourFechaInicio[h]) console.log(`  ${String(h).padStart(2, '0')}h: ${byHourFechaInicio[h]} pedidos`)
}

console.log('\n═══ DISTRIBUCIÓN POR HORA — desde hora (campo text) ═══')
const byHourHora = {}
for (const r of all) {
  if (!r.hora) continue
  // Intentar parsear formatos: "HH:MM:SS", "HH:MM", número entero como string
  const match = String(r.hora).match(/^(\d{1,2})/)
  if (!match) continue
  const h = parseInt(match[1], 10)
  if (h >= 0 && h <= 23) byHourHora[h] = (byHourHora[h] || 0) + 1
}
for (let h = 0; h < 24; h++) {
  if (byHourHora[h]) console.log(`  ${String(h).padStart(2, '0')}h: ${byHourHora[h]} pedidos`)
}

// ── 5. Smoke test: ventas por franja ──────────────────────────────────────────
function getHour(r) {
  // Usar fecha_inicio si disponible, sino hora (text), sino -1
  if (r.fecha_inicio) {
    const d = new Date(r.fecha_inicio)
    return isNaN(d) ? -1 : d.getUTCHours()
  }
  if (r.hora) {
    const m = String(r.hora).match(/^(\d{1,2})/)
    if (m) return parseInt(m[1], 10)
  }
  return -1
}

function getHourFromHora(r) {
  if (!r.hora) return -1
  const m = String(r.hora).match(/^(\d{1,2})/)
  return m ? parseInt(m[1], 10) : -1
}

function franja(h) {
  if (h >= 12 && h < 16) return 'Mediodía (12–16)'
  if (h >= 16 && h < 20) return 'Tarde (16–20)'
  if (h >= 20 && h < 24) return 'Noche (20–24)'
  if (h === -1)          return 'Sin hora'
  return 'Madrugada/otros (0–12)'
}

console.log('\n═══ VENTAS POR FRANJA — usando fecha_inicio ═══')
const accFI = {}
for (const r of all) {
  const h = getHour(r)
  const f = franja(h)
  if (!accFI[f]) accFI[f] = { total: 0, pedidos: 0 }
  accFI[f].total   += Number(r.total)
  accFI[f].pedidos += 1
}
let grandTotalFI = 0, grandPedidosFI = 0
for (const [f, v] of Object.entries(accFI).sort()) {
  console.log(`  ${f.padEnd(25)}: $${Math.round(v.total).toLocaleString('es-AR').padStart(14)} | ${v.pedidos} pedidos`)
  grandTotalFI   += v.total
  grandPedidosFI += v.pedidos
}
console.log(`  ${'TOTAL'.padEnd(25)}: $${Math.round(grandTotalFI).toLocaleString('es-AR').padStart(14)} | ${grandPedidosFI} pedidos`)

console.log('\n═══ VENTAS POR FRANJA — usando campo hora ═══')
const accH = {}
for (const r of all) {
  const h = getHourFromHora(r)
  const f = franja(h)
  if (!accH[f]) accH[f] = { total: 0, pedidos: 0 }
  accH[f].total   += Number(r.total)
  accH[f].pedidos += 1
}
let grandTotalH = 0, grandPedidosH = 0
for (const [f, v] of Object.entries(accH).sort()) {
  console.log(`  ${f.padEnd(25)}: $${Math.round(v.total).toLocaleString('es-AR').padStart(14)} | ${v.pedidos} pedidos`)
  grandTotalH   += v.total
  grandPedidosH += v.pedidos
}
console.log(`  ${'TOTAL'.padEnd(25)}: $${Math.round(grandTotalH).toLocaleString('es-AR').padStart(14)} | ${grandPedidosH} pedidos`)
