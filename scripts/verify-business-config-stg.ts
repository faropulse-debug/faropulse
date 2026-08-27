/**
 * Verificación H3 Parte A — location_business_config, con sesiones
 * autenticadas REALES contra STG (nunca service_role: con el gate
 * user_has_membership/user_has_write_role, service_role devuelve vacío en
 * vez de error, lo que puede hacer pasar un test que en realidad está roto).
 *
 * Uso: npx tsx scripts/verify-business-config-stg.ts
 *
 * Requiere el dev server de Next corriendo contra STG (la escritura pasa
 * por app/api/business-config, no por una RPC) — ver README del script
 * o correr:
 *   (Get-Content .env.staging) -join ' ' # PowerShell: exportar a mano
 * o simplemente levantar `next dev` con las env vars de .env.staging.
 * DEV_SERVER_URL (default http://localhost:3401) apunta a esa instancia.
 */

import * as fs from 'fs'
import * as path from 'path'

function loadEnv(file: string): Record<string, string> {
  const envPath = path.resolve(process.cwd(), file)
  if (!fs.existsSync(envPath)) return {}
  return Object.fromEntries(
    fs.readFileSync(envPath, 'utf8')
      .split('\n')
      .filter(l => l.trim() && !l.startsWith('#') && l.includes('='))
      .map(l => { const [k, ...v] = l.split('='); return [k.trim(), v.join('=').trim()] }),
  )
}

const env = { ...loadEnv('.env.staging'), ...loadEnv('.env.stg-test-users'), ...process.env }

const SUPA_URL       = env.NEXT_PUBLIC_SUPABASE_URL
const ANON_KEY       = env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const DEV_SERVER_URL = env.DEV_SERVER_URL ?? 'http://localhost:3401'

const DEMO_ITUZAINGO_LOCATION_ID = 'bbbbbbbb-0000-0000-0000-000000000001' // qa-owner: role=owner acá
const SUCURSAL_NORTE_LOCATION_ID = 'f203a8fe-fc04-40d8-bc08-3c7571b4c008' // qa-owner: role=encargado acá (bonus check)

if (!SUPA_URL || !ANON_KEY || !env.QA_OWNER_EMAIL || !env.QA_OWNER_PASSWORD || !env.QA_MANAGER_EMAIL || !env.QA_MANAGER_PASSWORD) {
  console.error('❌  Faltan credenciales en .env.staging / .env.stg-test-users')
  process.exit(1)
}

async function login(email: string, password: string): Promise<string> {
  const res = await fetch(`${SUPA_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'apikey': ANON_KEY! },
    body: JSON.stringify({ email, password }),
  })
  if (!res.ok) throw new Error(`Login ${email} falló: ${res.status} ${await res.text()}`)
  const json = await res.json() as { access_token?: string }
  if (!json.access_token) throw new Error(`Login ${email} no devolvió access_token`)
  return json.access_token
}

async function readConfig(jwt: string, locationId: string): Promise<Array<{ key: string; value: unknown; unit: string }>> {
  const res = await fetch(`${SUPA_URL}/rest/v1/rpc/get_location_business_config`, {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'apikey':        ANON_KEY!,
      'Authorization': `Bearer ${jwt}`,
    },
    body: JSON.stringify({ p_location_id: locationId }),
  })
  if (!res.ok) throw new Error(`RPC get_location_business_config error ${res.status}: ${await res.text()}`)
  return res.json() as Promise<Array<{ key: string; value: unknown; unit: string }>>
}

async function writeConfig(jwt: string, locationId: string, entries: Array<{ key: string; value: unknown }>) {
  const res = await fetch(`${DEV_SERVER_URL}/api/business-config?location_id=${locationId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${jwt}` },
    body: JSON.stringify({ entries }),
  })
  const json = await res.json().catch(() => ({}))
  return { status: res.status, json }
}

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

async function run() {
  console.log(`\nVerificación H3 Parte A — location_business_config — STG (${SUPA_URL})\n`)

  let ownerJwt = ''
  let managerJwt = ''

  await test('login qa-owner', async () => { ownerJwt = await login(env.QA_OWNER_EMAIL!, env.QA_OWNER_PASSWORD!) })
  await test('login qa-manager', async () => { managerJwt = await login(env.QA_MANAGER_EMAIL!, env.QA_MANAGER_PASSWORD!) })

  if (!ownerJwt || !managerJwt) {
    console.error('\n❌  Login falló — no se puede continuar\n')
    for (const r of results) console.log(`  ${r.ok ? '✓' : '✗'}  ${r.name}${r.ok ? '' : `  → ${r.detail}`}`)
    process.exit(1)
  }

  // ── Caso 1: qa-owner lee su location SIN config → "no configurado", no 0 ──
  await test('Caso 1 — sin config: RPC devuelve 0 filas (no una fila con value=0)', async () => {
    const rows = await readConfig(ownerJwt, DEMO_ITUZAINGO_LOCATION_ID)
    assert(Array.isArray(rows), `la RPC no devolvió un array: ${JSON.stringify(rows)}`)
    const preExisting = rows.filter(r => r.key === 'benchmark_laboral_pct')
    assert(preExisting.length === 0, `esperaba 0 filas para benchmark_laboral_pct (no configurado todavía); vino ${JSON.stringify(preExisting)}`)
  })

  // ── Caso 2: qa-owner escribe y lee de vuelta ────────────────────────────────
  await test('Caso 2 — qa-owner escribe benchmark_laboral_pct=32 en su location', async () => {
    const { status, json } = await writeConfig(ownerJwt, DEMO_ITUZAINGO_LOCATION_ID, [
      { key: 'benchmark_laboral_pct', value: 32 },
    ])
    assert(status === 200, `esperaba 200, vino ${status}: ${JSON.stringify(json)}`)
  })

  await test('Caso 2 — la lectura posterior devuelve exactamente el valor escrito (32), tipado number', async () => {
    const rows = await readConfig(ownerJwt, DEMO_ITUZAINGO_LOCATION_ID)
    const row = rows.find(r => r.key === 'benchmark_laboral_pct')
    assert(!!row, 'no se encontró la fila recién escrita')
    assert(row!.value === 32, `esperaba value=32, vino ${JSON.stringify(row!.value)}`)
    assert(row!.unit === 'pct', `esperaba unit=pct, vino ${row!.unit}`)
  })

  // ── Caso 3: qa-manager intenta escribir → rechazado ─────────────────────────
  await test('Caso 3 — qa-manager NO puede escribir (rol fuera de WRITE_ROLES)', async () => {
    const { status } = await writeConfig(managerJwt, DEMO_ITUZAINGO_LOCATION_ID, [
      { key: 'benchmark_laboral_pct', value: 99 },
    ])
    assert(status === 403, `esperaba 403, vino ${status}`)
  })

  // ── Bonus: qa-owner es 'encargado' (no owner) en Sucursal Norte ─────────────
  await test('Bonus — qa-owner NO puede escribir en Sucursal Norte (ahí es encargado, no owner)', async () => {
    const { status } = await writeConfig(ownerJwt, SUCURSAL_NORTE_LOCATION_ID, [
      { key: 'benchmark_laboral_pct', value: 50 },
    ])
    assert(status === 403, `🔴 esperaba 403 (mismo patrón que P0-B), vino ${status} — encargado pudo escribir config financiera cross-location`)
  })

  const passed = results.filter(r => r.ok).length
  const failed = results.filter(r => !r.ok).length

  console.log('Resultados:')
  for (const r of results) console.log(`  ${r.ok ? '✓' : '✗'}  ${r.name}${r.ok ? '' : `  → ${r.detail}`}`)
  console.log(`\n${passed}/${results.length} passed`)
  if (failed > 0) process.exit(1)
}

run().catch(e => { console.error('Fatal:', e); process.exit(1) })
