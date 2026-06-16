/**
 * Regression test: verifica que STG tiene datos válidos para todos los widgets.
 * Uso: npx tsx scripts/regression-test.ts
 * Exit code 1 si algún test falla.
 */

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
const SUPA_KEY = env.SUPABASE_SERVICE_ROLE_KEY
const LOCATION_ID = 'bbbbbbbb-0000-0000-0000-000000000001'

if (!SUPA_URL || !SUPA_KEY) {
  console.error('❌  Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const HEADERS = {
  'Content-Type': 'application/json',
  'apikey':       SUPA_KEY,
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function sql(query: string): Promise<unknown[]> {
  const res = await fetch('https://api.supabase.com/v1/projects/egjxyskqhnmuqwkrbshu/database/query', {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${env.SUPABASE_ACCESS_TOKEN}`,
    },
    body: JSON.stringify({ query }),
  })
  if (!res.ok) throw new Error(`SQL error ${res.status}: ${await res.text()}`)
  return res.json() as Promise<unknown[]>
}

async function rpc(fn: string, params: Record<string, unknown> = {}): Promise<unknown[]> {
  const res = await fetch(`${SUPA_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { ...HEADERS, 'Prefer': 'return=representation' },
    body: JSON.stringify(params),
  })
  if (!res.ok) throw new Error(`RPC ${fn} error ${res.status}: ${await res.text()}`)
  const json = await res.json() as unknown
  return Array.isArray(json) ? json : []
}

// ── Today helper ──────────────────────────────────────────────────────────────

const today = new Date()
const thirtyDaysAgo = new Date(today); thirtyDaysAgo.setDate(today.getDate() - 30)
const dateThreshold = thirtyDaysAgo.toISOString().split('T')[0]

// ── Tests ─────────────────────────────────────────────────────────────────────

type TestResult = { name: string; ok: boolean; detail: string }
const results: TestResult[] = []

async function test(name: string, fn: () => Promise<void>) {
  try {
    await fn()
    results.push({ name, ok: true, detail: 'OK' })
  } catch (e: unknown) {
    results.push({ name, ok: false, detail: e instanceof Error ? e.message : String(e) })
  }
}

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg)
}

// ── Run ───────────────────────────────────────────────────────────────────────

async function run() {
  console.log(`\nRegression test — STG ${SUPA_URL}\n`)

  await test('sales_documents: count > 10000', async () => {
    const rows = await sql(`SELECT count(*)::int as n FROM sales_documents WHERE location_id = '${LOCATION_ID}'`)
    const n = (rows[0] as { n: number }).n
    assert(n > 10000, `count = ${n}`)
  })

  await test(`sales_documents: max(fecha) >= ${dateThreshold}`, async () => {
    const rows = await sql(`SELECT max(fecha)::text as m FROM sales_documents WHERE location_id = '${LOCATION_ID}'`)
    const m = (rows[0] as { m: string }).m
    assert(m >= dateThreshold, `max fecha = ${m}`)
  })

  await test('sales_items: count > 50000', async () => {
    const rows = await sql(`SELECT count(*)::int as n FROM sales_items WHERE location_id = '${LOCATION_ID}'`)
    const n = (rows[0] as { n: number }).n
    assert(n > 50000, `count = ${n}`)
  })

  await test('sales_items: ningún row con fecha_caja NULL', async () => {
    const rows = await sql(`
      SELECT count(*)::int as total, count(fecha_caja)::int as con_fecha
      FROM sales_items
      WHERE location_id = '${LOCATION_ID}'
    `)
    const r = rows[0] as { total: number; con_fecha: number }
    assert(r.total === r.con_fecha, `${r.total - r.con_fecha} rows tienen fecha_caja NULL (total=${r.total}, con_fecha=${r.con_fecha})`)
  })

  // ── Idempotencia: el patrón delete-then-insert no debe dejar duplicados ──────

  await test('sales_documents: sin external_id duplicado por location', async () => {
    const rows = await sql(`
      SELECT count(*)::int as dup_groups
      FROM (
        SELECT external_id
        FROM sales_documents
        WHERE location_id = '${LOCATION_ID}'
        GROUP BY external_id
        HAVING count(*) > 1
      ) sub
    `)
    const n = (rows[0] as { dup_groups: number }).dup_groups
    assert(n === 0, `${n} external_ids con duplicados en sales_documents (re-upload no fue idempotente)`)
  })

  await test('sales_items: sin duplicados por (external_id, codigo, descripcion, cantidad, precio_total, fecha_item)', async () => {
    const rows = await sql(`
      SELECT count(*)::int as dup_groups
      FROM (
        SELECT external_id, codigo, descripcion, cantidad, precio_total, fecha_item
        FROM sales_items
        WHERE location_id = '${LOCATION_ID}'
        GROUP BY external_id, codigo, descripcion, cantidad, precio_total, fecha_item
        HAVING count(*) > 1
      ) sub
    `)
    const n = (rows[0] as { dup_groups: number }).dup_groups
    assert(n === 0, `${n} grupos duplicados en sales_items (re-upload no fue idempotente)`)
  })

  await test('financial_results: count = 363', async () => {
    const rows = await sql(`SELECT count(*)::int as n FROM financial_results WHERE location_id = '${LOCATION_ID}'`)
    const n = (rows[0] as { n: number }).n
    assert(n === 363, `count = ${n}`)
  })

  await test('RPC get_financial_results: devuelve > 0 filas', async () => {
    const rows = await rpc('get_financial_results', { p_location_id: LOCATION_ID })
    assert(rows.length > 0, `devolvió ${rows.length} filas`)
  })

  await test('RPC get_daily_sales_full: devuelve > 0 filas', async () => {
    const rows = await rpc('get_daily_sales_full', { p_location_id: LOCATION_ID })
    assert(rows.length > 0, `devolvió ${rows.length} filas`)
  })

  await test('RPC get_comensales_full: devuelve > 0 filas con comensales > 0', async () => {
    const rows = await rpc('get_comensales_full', { p_location_id: LOCATION_ID }) as Array<Record<string, unknown>>
    assert(rows.length > 0, `devolvió ${rows.length} filas`)
    const withComensales = rows.filter(r => Number(r.comensales ?? r.total_comensales ?? 0) > 0)
    assert(withComensales.length > 0, `ninguna fila tiene comensales > 0`)
  })

  await test('RPC get_weekly_sales_full: devuelve > 0 filas', async () => {
    const rows = await rpc('get_weekly_sales_full', { p_location_id: LOCATION_ID })
    assert(rows.length > 0, `devolvió ${rows.length} filas`)
  })

  await test('RPC get_ticket_promedio_full: devuelve > 0 filas', async () => {
    const rows = await rpc('get_ticket_promedio_full', { p_location_id: LOCATION_ID })
    assert(rows.length > 0, `devolvió ${rows.length} filas`)
  })

  // ── Report ──────────────────────────────────────────────────────────────────

  const passed = results.filter(r => r.ok).length
  const failed = results.filter(r => !r.ok).length

  console.log('Results:')
  for (const r of results) {
    const icon = r.ok ? '✓' : '✗'
    const detail = r.ok ? '' : `  → ${r.detail}`
    console.log(`  ${icon}  ${r.name}${detail}`)
  }

  console.log(`\n${passed}/${results.length} passed`)

  if (failed > 0) {
    console.error(`\n❌  ${failed} test(s) fallaron — bloquear merge a main\n`)
    process.exit(1)
  }

  console.log('\n✅  Todos los tests pasaron — safe to merge\n')
}

run().catch(e => { console.error('Fatal:', e); process.exit(1) })
