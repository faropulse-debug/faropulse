import * as fs from 'fs'
import * as path from 'path'

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
const env = { ...loadEnv('.env.staging'), ...loadEnv('.env.local.prod'), ...process.env }
const LOCATION_ID = 'bbbbbbbb-0000-0000-0000-000000000001'

async function sql(projectRef: string, query: string) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${env.SUPABASE_ACCESS_TOKEN}`,
    },
    body: JSON.stringify({ query }),
  })
  if (!res.ok) throw new Error(`SQL error ${res.status}: ${await res.text()}`)
  return res.json()
}

async function callRpcSafe(projectRef: string, userId: string, fnName: string, args: string) {
  const fullQuery = `
    SELECT * FROM (SELECT set_config('request.jwt.claims', '{"sub":"${userId}", "role":"authenticated"}', true)) as s, public.${fnName}(${args});
  `
  return await sql(projectRef, fullQuery)
}

async function run() {
  const STG_REF = 'egjxyskqhnmuqwkrbshu'
  const PROD_REF = 'lahnngwyfbejgesulafr'

  // Get user uuid on STG
  const stgUserRows: any = await sql(STG_REF, `SELECT id FROM auth.users WHERE email = 'owner@demo.com' LIMIT 1`)
  const stgUserId = stgUserRows?.[0]?.id

  console.log('\n--- 1) NÚMEROS CON LOS DATOS NUEVOS ---')
  const maxFechaStg = await sql(STG_REF, `SELECT max(fecha_caja) FROM sales_documents WHERE location_id = '${LOCATION_ID}'`)
  console.log('MAX fecha_caja (STG):', maxFechaStg)

  const pJul31 = await callRpcSafe(STG_REF, stgUserId, 'get_ventas_periodo', `'${LOCATION_ID}'::uuid, '2026-07-01'::date, '2026-07-31'::date`)
  console.log('get_ventas_periodo(jul 1-31):', pJul31)

  const pJul23 = await callRpcSafe(STG_REF, stgUserId, 'get_ventas_periodo', `'${LOCATION_ID}'::uuid, '2026-07-01'::date, '2026-07-23'::date`)
  const pJun23 = await callRpcSafe(STG_REF, stgUserId, 'get_ventas_periodo', `'${LOCATION_ID}'::uuid, '2026-06-01'::date, '2026-06-23'::date`)
  console.log('get_ventas_periodo(jul 1-23):', pJul23)
  console.log('get_ventas_periodo(jun 1-23):', pJun23)

  const frescura = await callRpcSafe(STG_REF, stgUserId, 'get_data_freshness', `'${LOCATION_ID}'::uuid`)
  console.log('get_data_freshness (STG):', frescura)

  console.log('\n--- 2) LAS 12 SEMANAS ---')
  const cascada12 = await callRpcSafe(STG_REF, stgUserId, 'get_ventas_cascada_semanal', `'${LOCATION_ID}'::uuid`)
  console.log('Cascada sin parámetro (deberían ser 12):', cascada12?.length)

  const cascada6 = await callRpcSafe(STG_REF, stgUserId, 'get_ventas_cascada_semanal', `'${LOCATION_ID}'::uuid, 6`)
  console.log('Cascada p_semanas=6:', cascada6?.length)

  const cascada1 = await callRpcSafe(STG_REF, stgUserId, 'get_ventas_cascada_semanal', `'${LOCATION_ID}'::uuid, 1`)
  console.log('Cascada p_semanas=1:', cascada1?.length)

  const procs = await sql(STG_REF, `SELECT proname, proargnames FROM pg_proc WHERE proname = 'get_ventas_cascada_semanal'`)
  console.log('pg_proc get_ventas_cascada_semanal (CRÍTICO: debe haber 1):', procs)

  console.log('\n--- 4) REGRESIÓN ---')
  const ene26Count = await sql(STG_REF, `SELECT count(*)::int as c FROM sales_documents WHERE location_id = '${LOCATION_ID}' AND fecha_caja >= '2026-01-01' AND fecha_caja <= '2026-01-31'`)
  const feb26Count = await sql(STG_REF, `SELECT count(*)::int as c FROM sales_documents WHERE location_id = '${LOCATION_ID}' AND fecha_caja >= '2026-02-01' AND fecha_caja <= '2026-02-28'`)
  const jul26Count = await sql(STG_REF, `SELECT count(*)::int as c FROM sales_documents WHERE location_id = '${LOCATION_ID}' AND fecha_caja >= '2026-07-01' AND fecha_caja <= '2026-07-31'`)
  console.log('Ene 2026 (sales_documents count):', ene26Count)
  console.log('Feb 2026 (sales_documents count):', feb26Count)
  console.log('Jul 2026 (sales_documents count):', jul26Count)

  console.log('\n--- 5) BONUS - VERIFICACIÓN EN PROD ---')
  const prodFrescura = await sql(PROD_REF, `SELECT * FROM public.data_freshness WHERE location_id = '${LOCATION_ID}'`)
  console.log('data_freshness PROD (direct DB):', prodFrescura)
}

run().catch(console.error)
