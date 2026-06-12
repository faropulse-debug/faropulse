/**
 * Diagnóstico read-only: totales por canal para mayo 2026.
 * Uso: node --env-file=.env.local scripts/diag-canal-mayo.mjs
 * NUNCA imprime llaves.
 */
import { createClient } from '@supabase/supabase-js'

const URL_BASE    = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const LOCATION_ID = 'bbbbbbbb-0000-0000-0000-000000000001'

if (!URL_BASE || !SERVICE_KEY) { console.error('Faltan env vars'); process.exit(1) }
const supa = createClient(URL_BASE, SERVICE_KEY, { auth: { persistSession: false } })

const { data, error } = await supa
  .from('sales_documents')
  .select('tipo_zona, total')
  .eq('location_id', LOCATION_ID)
  .gte('fecha', '2026-05-01')
  .lt('fecha',  '2026-06-01')

if (error) { console.error(error.message); process.exit(1) }

const acc = {}
for (const r of data) {
  const canal = r.tipo_zona === 'SALON' ? 'Salón' : r.tipo_zona === 'MOSTRADOR' ? 'TakeAway' : 'Delivery'
  if (!acc[canal]) acc[canal] = { pedidos: 0, ventas: 0 }
  acc[canal].pedidos++
  acc[canal].ventas += Number(r.total)
}

console.log('Mayo 2026 por canal (muestra, limit Supabase = 1000):')
let totalPed = 0, totalVent = 0
for (const [c, v] of Object.entries(acc).sort((a, b) => b[1].ventas - a[1].ventas)) {
  totalPed  += v.pedidos
  totalVent += v.ventas
  console.log(`  ${c.padEnd(10)} pedidos=${v.pedidos}  ventas=$${Math.round(v.ventas).toLocaleString('es-AR')}`)
}
console.log(`  ${'TOTAL'.padEnd(10)} pedidos=${totalPed}  ventas=$${Math.round(totalVent).toLocaleString('es-AR')}`)
console.log()
console.log('Nota: Supabase limita a 1000 filas sin paginación.')
console.log('Mayo 2026 tiene 691 docs en total (validado Sprint de Datos).')
console.log('Si totalPed < 691, la muestra está truncada.')
