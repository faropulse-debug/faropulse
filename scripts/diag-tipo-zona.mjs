/**
 * Diagnóstico read-only: SELECT DISTINCT tipo_zona para el location de dev.
 * Uso: node --env-file=.env.local scripts/diag-tipo-zona.mjs
 * NUNCA imprime llaves.
 */
import { createClient } from '@supabase/supabase-js'

const URL_BASE    = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const LOCATION_ID = 'bbbbbbbb-0000-0000-0000-000000000001'

if (!URL_BASE || !SERVICE_KEY) {
  console.error('[diag] Faltan variables. Usá --env-file=.env.local')
  process.exit(1)
}

const supa = createClient(URL_BASE, SERVICE_KEY, { auth: { persistSession: false } })

// Traemos todos los tipo_zona distintos (< 20 valores esperados)
const { data, error } = await supa
  .from('sales_documents')
  .select('tipo_zona')
  .eq('location_id', LOCATION_ID)
  .limit(50000)

if (error) { console.error('[diag] ERROR:', error.message); process.exit(1) }

const counts = {}
for (const r of data) {
  const k = r.tipo_zona ?? '(null)'
  counts[k] = (counts[k] ?? 0) + 1
}

console.log(`Rows analizadas: ${data.length}`)
console.log('\nSELECT DISTINCT tipo_zona — con conteo de documentos:')
for (const [zona, n] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(zona).padEnd(20)} ${n} docs`)
}

// Mapeo propuesto
console.log('\nMapeo propuesto (CASE ... ELSE Delivery):')
for (const zona of Object.keys(counts)) {
  const canal = zona === 'SALON' ? 'Salón' : zona === 'MOSTRADOR' ? 'TakeAway' : 'Delivery'
  console.log(`  ${String(zona).padEnd(20)} → ${canal}`)
}
