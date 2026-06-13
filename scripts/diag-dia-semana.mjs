// Diagnóstico: ventas por día de semana — mayo 2026, STG
// Uso: node --env-file=.env.local scripts/diag-dia-semana.mjs
// NUNCA imprime keys — sólo usa process.env internamente.

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const ANON_KEY     = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const LOCATION_ID  = 'bbbbbbbb-0000-0000-0000-000000000001'

if (!SUPABASE_URL || !ANON_KEY) {
  console.error('Faltan variables NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY')
  process.exit(1)
}

const url = `${SUPABASE_URL}/rest/v1/sales_documents?select=fecha,total&location_id=eq.${LOCATION_ID}&fecha=gte.2026-05-01&fecha=lt.2026-06-01&limit=5000`

const res = await fetch(url, {
  headers: {
    'apikey':        ANON_KEY,
    'Authorization': `Bearer ${ANON_KEY}`,
  },
})

if (!res.ok) {
  console.error('HTTP', res.status, await res.text())
  process.exit(1)
}

const rows = await res.json()
console.log(`\nFilas mayo 2026: ${rows.length}`)

const DOW_NAMES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
const ORDER     = [1, 2, 3, 4, 5, 6, 0]   // Lun → Dom

const acc = {}
for (let d = 0; d < 7; d++) acc[d] = { total: 0, pedidos: 0, fechas: new Set() }

for (const r of rows) {
  const date = new Date(r.fecha.substring(0, 10) + 'T12:00:00')
  const dow  = date.getDay()
  acc[dow].total   += Number(r.total)
  acc[dow].pedidos += 1
  acc[dow].fechas.add(r.fecha.substring(0, 10))
}

console.log('\nDía     | Total ventas         | Días en mes | Pedidos | Prom/día')
console.log('--------|----------------------|-------------|---------|------------------')

let grandTotal = 0, grandPedidos = 0
for (const dow of ORDER) {
  const { total, pedidos, fechas } = acc[dow]
  const occ  = fechas.size
  const prom = occ > 0 ? Math.round(total / occ) : 0
  grandTotal   += total
  grandPedidos += pedidos
  console.log(
    `${DOW_NAMES[dow].padEnd(7)} | $${String(Math.round(total)).padStart(19)} | ${String(occ).padStart(11)} | ${String(pedidos).padStart(7)} | $${String(prom).padStart(15)}`
  )
}
console.log('--------|----------------------|-------------|---------|------------------')
console.log(`${'TOTAL'.padEnd(7)} | $${String(Math.round(grandTotal)).padStart(19)} |             | ${String(grandPedidos).padStart(7)} |`)
