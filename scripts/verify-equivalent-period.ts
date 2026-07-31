import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs'
import * as path from 'path'

// ── Env ───────────────────────────────────────────────────────────────────────
function loadEnv(file: string): Record<string, string> {
  const envPath = path.resolve(process.cwd(), file)
  if (!fs.existsSync(envPath)) return {}
  return Object.fromEntries(
    fs.readFileSync(envPath, 'utf8')
      .split('\n')
      .filter(l => l.trim() && !l.startsWith('#') && l.includes('='))
      .map(l => { const [k, ...v] = l.split('='); return [k.trim(), v.join('=').trim()] })
  )
}
const env = { ...loadEnv('.env.staging'), ...process.env }
const SUPA_URL = env.NEXT_PUBLIC_SUPABASE_URL
const SUPA_KEY = env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!SUPA_URL || !SUPA_KEY) {
  console.error('❌  Faltan vars')
  process.exit(1)
}

const supabase = createClient(SUPA_URL, SUPA_KEY)
const LOCATION_ID = 'bbbbbbbb-0000-0000-0000-000000000001'

async function run() {
  async function sql(query: string) {
    const res = await fetch('https://api.supabase.com/v1/projects/egjxyskqhnmuqwkrbshu/database/query', {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${env.SUPABASE_ACCESS_TOKEN}`,
      },
      body: JSON.stringify({ query }),
    })
    if (!res.ok) throw new Error(`SQL error ${res.status}: ${await res.text()}`)
    return res.json()
  }

  // 1. Get user uuid
  const userRows: any = await sql(`SELECT id FROM auth.users WHERE email = 'owner@demo.com' LIMIT 1`)
  if (!userRows || userRows.length === 0) {
    console.error('User not found')
    return
  }
  const userId = userRows[0].id
  console.log('User ID:', userId)

  async function callRpcSafe(fnName: string, args: string) {
    const fullQuery = `
      SELECT * FROM (SELECT set_config('request.jwt.claims', '{"sub":"${userId}", "role":"authenticated"}', true)) as s, public.${fnName}(${args});
    `
    return await sql(fullQuery)
  }

  console.log('\n--- 1) ARITMÉTICA DEL PERÍODO EQUIVALENTE ---')
  const pJul1_20 = await callRpcSafe('get_ventas_periodo', `'${LOCATION_ID}'::uuid, '2026-07-01'::date, '2026-07-20'::date`)
  const pJun1_20 = await callRpcSafe('get_ventas_periodo', `'${LOCATION_ID}'::uuid, '2026-06-01'::date, '2026-06-20'::date`)
  console.log('Jul 1-20:', pJul1_20)
  console.log('Jun 1-20:', pJun1_20)

  console.log('\n--- 2) EL CLAMP ---')
  const pJul1_31 = await callRpcSafe('get_ventas_periodo', `'${LOCATION_ID}'::uuid, '2026-07-01'::date, '2026-07-31'::date`)
  console.log('Jul 1-31:', pJul1_31)

  console.log('\n--- 3) MESES COMPLETOS ---')
  const pJun1_30 = await callRpcSafe('get_ventas_periodo', `'${LOCATION_ID}'::uuid, '2026-06-01'::date, '2026-06-30'::date`)
  const pMay1_31 = await callRpcSafe('get_ventas_periodo', `'${LOCATION_ID}'::uuid, '2026-05-01'::date, '2026-05-31'::date`)
  const pMar1_31 = await callRpcSafe('get_ventas_periodo', `'${LOCATION_ID}'::uuid, '2026-03-01'::date, '2026-03-31'::date`)
  const pFeb1_28 = await callRpcSafe('get_ventas_periodo', `'${LOCATION_ID}'::uuid, '2026-02-01'::date, '2026-02-28'::date`)
  console.log('Jun 1-30:', pJun1_30)
  console.log('May 1-31:', pMay1_31)
  console.log('Mar 1-31:', pMar1_31)
  console.log('Feb 1-28:', pFeb1_28)

  console.log('\n--- 4) CASCADA SEMANAL ---')
  const cascada = await callRpcSafe('get_ventas_cascada_semanal', `'${LOCATION_ID}'::uuid`)
  console.log('Cascada:', cascada)

  console.log('\n--- 5) FRESCURA (MAX fecha_caja) ---')
  const frescura = await callRpcSafe('get_data_freshness', `'${LOCATION_ID}'::uuid`)
  console.log('Data Freshness:', frescura)
  const qMax = await sql(`SELECT max(fecha_caja) FROM sales_documents WHERE location_id = '${LOCATION_ID}'`)
  console.log('MAX fecha_caja (from DB direct):', qMax)

  console.log('\n--- 6) REGRESIÓN: RPCs analíticas ---')
  const ene26Count = await sql(`SELECT count(*)::int as c FROM sales_documents WHERE location_id = '${LOCATION_ID}' AND fecha_caja >= '2026-01-01' AND fecha_caja <= '2026-01-31'`)
  const feb26Count = await sql(`SELECT count(*)::int as c FROM sales_documents WHERE location_id = '${LOCATION_ID}' AND fecha_caja >= '2026-02-01' AND fecha_caja <= '2026-02-28'`)
  const jul26Count = await sql(`SELECT count(*)::int as c FROM sales_documents WHERE location_id = '${LOCATION_ID}' AND fecha_caja >= '2026-07-01' AND fecha_caja <= '2026-07-31'`)
  console.log('Ene 2026 (sales_documents count):', ene26Count)
  console.log('Feb 2026 (sales_documents count):', feb26Count)
  console.log('Jul 2026 (sales_documents count):', jul26Count)



}
run().catch(console.error)
