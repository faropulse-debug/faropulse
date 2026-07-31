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

const env = { ...loadEnv('.env.staging'), ...loadEnv('.env.stg-test-users'), ...process.env }

const SUPA_URL = env.NEXT_PUBLIC_SUPABASE_URL
const SUPA_KEY = env.SUPABASE_SERVICE_ROLE_KEY
const ANON_KEY = env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const LOCATION_ID = 'bbbbbbbb-0000-0000-0000-000000000001'

if (!SUPA_URL || !SUPA_KEY) {
  console.error('❌  Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

if (!ANON_KEY || !env.QA_OWNER_EMAIL || !env.QA_OWNER_PASSWORD) {
  console.error('❌  Faltan NEXT_PUBLIC_SUPABASE_ANON_KEY / QA_OWNER_EMAIL / QA_OWNER_PASSWORD')
  process.exit(1)
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

// RPCs pasan por SECURITY DEFINER functions que gatean por membership real
// (auth.uid() contra la tabla memberships) — necesitan un JWT de usuario de
// verdad, no la service_role key. Mismo patrón que tests/cross-tenant.test.ts.
let userJwt = ''

async function loginQaOwner(): Promise<string> {
  const res = await fetch(`${SUPA_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'apikey': ANON_KEY! },
    body: JSON.stringify({ email: env.QA_OWNER_EMAIL, password: env.QA_OWNER_PASSWORD }),
  })
  if (!res.ok) throw new Error(`Login qa-owner falló: ${res.status} ${await res.text()}`)
  const json = await res.json() as { access_token?: string }
  if (!json.access_token) throw new Error('Login qa-owner no devolvió access_token')
  return json.access_token
}

async function rpc(fn: string, params: Record<string, unknown> = {}): Promise<unknown[]> {
  const res = await fetch(`${SUPA_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'apikey':        ANON_KEY!,
      'Authorization': `Bearer ${userJwt}`,
      'Prefer':        'return=representation',
    },
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

  await test('auth: login qa-owner (JWT real para RPCs con membership gate)', async () => {
    userJwt = await loginQaOwner()
    assert(!!userJwt, 'no se obtuvo access_token')
  })

  if (!userJwt) {
    console.error('\n❌  Login qa-owner falló — no se puede continuar, todos los tests de RPC dependen de este JWT\n')
    for (const r of results) console.log(`  ${r.ok ? '✓' : '✗'}  ${r.name}${r.ok ? '' : `  → ${r.detail}`}`)
    process.exit(1)
  }

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

  await test('sales_documents: sin ticket_hash duplicado por location', async () => {
    const rows = await sql(`
      SELECT count(*)::int as dup_groups
      FROM (
        SELECT ticket_hash
        FROM sales_documents
        WHERE location_id = '${LOCATION_ID}'
        GROUP BY ticket_hash
        HAVING count(*) > 1
      ) sub
    `)
    const n = (rows[0] as { dup_groups: number }).dup_groups
    assert(n === 0, `${n} ticket_hash con duplicados en sales_documents (re-upload no fue idempotente, o el constraint UNIQUE no está activo)`)
  })

  await test('sales_documents: ningún row con ticket_hash NULL', async () => {
    const rows = await sql(`
      SELECT count(*)::int as n
      FROM sales_documents
      WHERE location_id = '${LOCATION_ID}' AND ticket_hash IS NULL
    `)
    const n = (rows[0] as { n: number }).n
    assert(n === 0, `${n} rows con ticket_hash NULL (entraron por un path que no calcula el hash — el UNIQUE index no bloquea NULLs duplicados)`)
  })

  await test('sales_items: sin item_hash duplicado por location', async () => {
    const rows = await sql(`
      SELECT count(*)::int as dup_groups
      FROM (
        SELECT item_hash
        FROM sales_items
        WHERE location_id = '${LOCATION_ID}'
        GROUP BY item_hash
        HAVING count(*) > 1
      ) sub
    `)
    const n = (rows[0] as { dup_groups: number }).dup_groups
    assert(n === 0, `${n} item_hash con duplicados en sales_items (re-upload no fue idempotente, o el constraint UNIQUE no está activo)`)
  })

  await test('sales_items: ningún row con item_hash NULL', async () => {
    const rows = await sql(`
      SELECT count(*)::int as n
      FROM sales_items
      WHERE location_id = '${LOCATION_ID}' AND item_hash IS NULL
    `)
    const n = (rows[0] as { n: number }).n
    assert(n === 0, `${n} rows con item_hash NULL (entraron por un path que no calcula el hash — el UNIQUE index no bloquea NULLs duplicados)`)
  })

  await test('financial_results: count > 300', async () => {
    const rows = await sql(`SELECT count(*)::int as n FROM financial_results WHERE location_id = '${LOCATION_ID}'`)
    const n = (rows[0] as { n: number }).n
    assert(n > 300, `count = ${n}`)
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
