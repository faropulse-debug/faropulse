/**
 * Inventario de consistencia: para cada función get_* que toca sales_documents
 * en la DB viva, ¿agrupa/filtra por fecha o por fecha_caja (día operativo)?
 *
 * Por qué existe: fecha_caja es el estándar del proyecto (decisión 2026-07-24,
 * ver supabase/migrations/20260724000001_ventas_family_fecha_caja.sql). Código
 * nuevo puede quedar desalineado sin que nadie lo note — pasó con
 * get_ventas_por_canal_semana, creada un día antes de fijar el estándar.
 * Re-correr este script después de agregar cualquier RPC nueva sobre
 * sales_documents para pescar ese drift temprano.
 *
 * Uso: npx tsx scripts/diag/rpc-fecha-inventory.ts
 * Requiere SUPABASE_ACCESS_TOKEN + PROJECT_REF (o NEXT_PUBLIC_SUPABASE_URL) en .env.staging.
 */
import * as fs from 'fs'
import * as path from 'path'

function loadEnvFile(file: string): Record<string, string> {
  const envPath = path.resolve(process.cwd(), file)
  return Object.fromEntries(
    fs.readFileSync(envPath, 'utf8')
      .split('\n')
      .filter(l => l.trim() && !l.startsWith('#') && l.includes('='))
      .map(l => { const [k, ...v] = l.split('='); return [k.trim(), v.join('=').trim()] }),
  )
}
function projectRefFromUrl(url?: string): string | undefined {
  return url?.match(/^https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1]
}
async function sqlQuery(ref: string, token: string, query: string): Promise<Record<string, unknown>[]> {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({ query }),
  })
  if (!res.ok) throw new Error(`SQL error ${res.status}: ${await res.text()}`)
  return res.json() as Promise<Record<string, unknown>[]>
}

async function main() {
  const stgEnv = loadEnvFile('.env.staging')
  const ref = stgEnv.PROJECT_REF ?? projectRefFromUrl(stgEnv.NEXT_PUBLIC_SUPABASE_URL)
  const token = stgEnv.SUPABASE_ACCESS_TOKEN
  if (!ref || !token) throw new Error('Falta PROJECT_REF o SUPABASE_ACCESS_TOKEN en .env.staging')

  const rows = await sqlQuery(ref, token, `
    SELECT p.proname, pg_get_functiondef(p.oid) AS def
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname LIKE 'get\\_%'
      AND pg_get_functiondef(p.oid) ILIKE '%sales_documents%'
    ORDER BY p.proname
  `)

  // Busca específicamente "<alias>.fecha" (uso real en WHERE/GROUP BY/ORDER BY),
  // no alias de columna de salida ("AS fecha", "RETURNS TABLE(fecha ...)"),
  // que no llevan el prefijo de tabla y generaban falsos positivos.
  const usesFechaCaja = (def: string) => /\bfecha_caja\b/i.test(def)
  const usesFechaCruda = (def: string) => /\b[a-z]\.fecha\b(?!_caja)/i.test(def)

  let drift = 0
  for (const r of rows) {
    const def = String(r.def)
    const fc = usesFechaCaja(def)
    const f = usesFechaCruda(def)
    const flag = f ? '  <-- usa fecha cruda, no fecha_caja' : ''
    if (f) drift++
    console.log(`${String(r.proname).padEnd(28)} fecha_caja=${fc ? 'si' : 'no'}  fecha=${f ? 'SI' : 'no'}${flag}`)
  }
  console.log(`\n${drift === 0 ? 'Todas las RPCs sobre sales_documents usan fecha_caja.' : `${drift} RPC(s) todavía usan fecha cruda — revisar si es deuda conocida o drift nuevo.`}`)
}
main().catch(e => { console.error('Fatal:', e); process.exit(1) })
