/**
 * Verificación H3 Parte A — DELETE /api/business-config, con sesiones
 * autenticadas REALES contra STG (nunca service_role: con el gate
 * user_has_write_role, service_role devuelve vacío en vez de error, lo que
 * puede hacer pasar un test que en realidad está roto).
 *
 * Uso: npx tsx scripts/verify-business-config-delete-stg.ts
 * Requiere el dev server de Next corriendo contra STG (la escritura/borrado
 * pasa por app/api/business-config, no por una RPC). DEV_SERVER_URL
 * (default http://localhost:3401) apunta a esa instancia.
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

async function deleteConfig(jwt: string, locationId: string, keys: string[]) {
  const res = await fetch(`${DEV_SERVER_URL}/api/business-config?location_id=${locationId}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${jwt}` },
    body: JSON.stringify({ keys }),
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
  console.log(`\nVerificación DELETE /api/business-config — STG (${SUPA_URL})\n`)

  let ownerJwt = ''
  let managerJwt = ''

  await test('login qa-owner', async () => { ownerJwt = await login(env.QA_OWNER_EMAIL!, env.QA_OWNER_PASSWORD!) })
  await test('login qa-manager', async () => { managerJwt = await login(env.QA_MANAGER_EMAIL!, env.QA_MANAGER_PASSWORD!) })

  if (!ownerJwt || !managerJwt) {
    console.error('\n❌  Login falló — no se puede continuar\n')
    for (const r of results) console.log(`  ${r.ok ? '✓' : '✗'}  ${r.name}${r.ok ? '' : `  → ${r.detail}`}`)
    process.exit(1)
  }

  // ── Precondición: la location arranca sin config (limpio de sesiones previas) ──
  await test('Precondición — sin config previa para benchmark_laboral_pct', async () => {
    const rows = await readConfig(ownerJwt, DEMO_ITUZAINGO_LOCATION_ID)
    const pre = rows.filter(r => r.key === 'benchmark_laboral_pct')
    assert(pre.length === 0, `esperaba 0 filas antes de escribir; vino ${JSON.stringify(pre)}`)
  })

  // ── Caso 1: escribir, confirmar, borrar clave EXISTENTE, confirmar ausencia ──
  await test('Caso 1a — qa-owner escribe benchmark_laboral_pct=45', async () => {
    const { status, json } = await writeConfig(ownerJwt, DEMO_ITUZAINGO_LOCATION_ID, [
      { key: 'benchmark_laboral_pct', value: 45 },
    ])
    assert(status === 200, `esperaba 200, vino ${status}: ${JSON.stringify(json)}`)
  })

  await test('Caso 1b — confirmado: la lectura ve el valor recién escrito', async () => {
    const rows = await readConfig(ownerJwt, DEMO_ITUZAINGO_LOCATION_ID)
    const row = rows.find(r => r.key === 'benchmark_laboral_pct')
    assert(!!row && row.value === 45, `esperaba value=45, vino ${JSON.stringify(row)}`)
  })

  await test('Caso 1c — qa-owner borra benchmark_laboral_pct (clave EXISTENTE) → 200', async () => {
    const { status, json } = await deleteConfig(ownerJwt, DEMO_ITUZAINGO_LOCATION_ID, ['benchmark_laboral_pct'])
    assert(status === 200, `esperaba 200, vino ${status}: ${JSON.stringify(json)}`)
    assert(Array.isArray(json.deleted) && json.deleted.includes('benchmark_laboral_pct'), `esperaba deleted incluya la key, vino ${JSON.stringify(json)}`)
  })

  await test('Caso 1d — confirmado: tras el DELETE, la RPC vuelve a devolver 0 filas (no configurado, no value=0)', async () => {
    const rows = await readConfig(ownerJwt, DEMO_ITUZAINGO_LOCATION_ID)
    const post = rows.filter(r => r.key === 'benchmark_laboral_pct')
    assert(post.length === 0, `esperaba 0 filas tras el DELETE; vino ${JSON.stringify(post)}`)
  })

  // ── Caso 2: borrar una clave que NUNCA tuvo fila → no es error ──────────────
  await test('Caso 2 — qa-owner borra mc_objetivo_pct (clave que NUNCA existió acá) → 200, no-op', async () => {
    const rows = await readConfig(ownerJwt, DEMO_ITUZAINGO_LOCATION_ID)
    assert(rows.filter(r => r.key === 'mc_objetivo_pct').length === 0, 'precondición rota: mc_objetivo_pct ya tenía fila')
    const { status, json } = await deleteConfig(ownerJwt, DEMO_ITUZAINGO_LOCATION_ID, ['mc_objetivo_pct'])
    assert(status === 200, `esperaba 200 (DELETE de una key sin fila no es error), vino ${status}: ${JSON.stringify(json)}`)
  })

  // ── Caso 3: qa-manager intenta borrar → rechazado ───────────────────────────
  await test('Caso 3 — qa-manager NO puede borrar (rol fuera de WRITE_ROLES) → 403', async () => {
    // Escribimos con el owner primero para tener algo real que el manager intente borrar.
    await writeConfig(ownerJwt, DEMO_ITUZAINGO_LOCATION_ID, [{ key: 'cv_umbral_saludable_pct', value: 37 }])
    const { status } = await deleteConfig(managerJwt, DEMO_ITUZAINGO_LOCATION_ID, ['cv_umbral_saludable_pct'])
    assert(status === 403, `esperaba 403, vino ${status}`)
  })

  // ── Limpieza final: dejar STG en 0 filas, como al empezar ───────────────────
  await test('Limpieza — borrar cv_umbral_saludable_pct que quedó del Caso 3 y confirmar 0 filas', async () => {
    await deleteConfig(ownerJwt, DEMO_ITUZAINGO_LOCATION_ID, ['cv_umbral_saludable_pct'])
    const rows = await readConfig(ownerJwt, DEMO_ITUZAINGO_LOCATION_ID)
    assert(rows.length === 0, `esperaba STG en 0 filas tras la limpieza; quedó ${JSON.stringify(rows)}`)
  })

  const passed = results.filter(r => r.ok).length
  const failed = results.filter(r => !r.ok).length

  console.log('Resultados:')
  for (const r of results) console.log(`  ${r.ok ? '✓' : '✗'}  ${r.name}${r.ok ? '' : `  → ${r.detail}`}`)
  console.log(`\n${passed}/${results.length} passed`)
  if (failed > 0) process.exit(1)
}

run().catch(e => { console.error('Fatal:', e); process.exit(1) })
