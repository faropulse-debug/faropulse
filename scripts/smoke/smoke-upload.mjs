/**
 * smoke-upload.mjs — E2E smoke test for the upload pipeline.
 * Run via: npm run smoke
 *
 * Requires a running dev server (or set SMOKE_BASE_URL for a deployed env).
 * Reads secrets from the environment (--env-file=.env passed by npm script).
 * STG location/org IDs are non-secret constants.
 */

import { createRequire }    from 'module'
import { fileURLToPath }    from 'url'
import path                 from 'path'
import fs                   from 'fs'
import os                   from 'os'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const require   = createRequire(import.meta.url)
const XLSX      = require(path.resolve(__dirname, '../../node_modules/xlsx'))

// ── Non-secret STG constants (safe to commit) ──────────────────────────────────
const STG_LOCATION_ID = 'bbbbbbbb-0000-0000-0000-000000000001'  // STG: Ituzaingo
const STG_ORG_ID      = 'aaaaaaaa-0000-0000-0000-000000000001'  // STG org

// ── Environment ────────────────────────────────────────────────────────────────
const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SVC_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY
const BASE_URL = process.env.SMOKE_BASE_URL ?? 'http://localhost:3000'

if (!SUPA_URL) { console.error('FATAL: NEXT_PUBLIC_SUPABASE_URL is not set'); process.exit(1) }
if (!SVC_KEY)  { console.error('FATAL: SUPABASE_SERVICE_ROLE_KEY is not set'); process.exit(1) }

// ── Helpers ────────────────────────────────────────────────────────────────────
const svcH = { apikey: SVC_KEY, Authorization: `Bearer ${SVC_KEY}`, 'Content-Type': 'application/json' }

let passed = 0
let failed = 0

function check(label, condition, detail = '') {
  if (condition) {
    console.log(`  ✓  ${label}`)
    passed++
  } else {
    console.error(`  ✗  ${label}${detail ? `  ← ${detail}` : ''}`)
    failed++
  }
}

async function restGet(resource, extra = {}) {
  return fetch(`${SUPA_URL}/rest/v1/${resource}`, { headers: { ...svcH, ...extra } })
}

// ── 1. Health ──────────────────────────────────────────────────────────────────
console.log(`\n── 1. Health  (${BASE_URL}) ──────────────────────────────────────`)
try {
  const hr = await fetch(`${BASE_URL}/api/health`, { signal: AbortSignal.timeout(6_000) })
  const hb = await hr.json()
  check('server responds',      hr.ok,                             `HTTP ${hr.status}`)
  check('supabase connected',   hb.supabaseConnection === 'ok',   JSON.stringify(hb))
  if (!hr.ok) {
    console.error(`\nFATAL: dev server not reachable at ${BASE_URL}\n`)
    process.exit(1)
  }
} catch (e) {
  check('server responds', false, String(e))
  console.error(`\nFATAL: cannot reach ${BASE_URL}. Start the dev server first.\n`)
  process.exit(1)
}

// ── 2. Query 5 real docs from STG ─────────────────────────────────────────────
console.log('\n── 2. Query 5 real STG docs ─────────────────────────────────────')
const qr = await restGet(
  `sales_documents?location_id=eq.${STG_LOCATION_ID}` +
  `&fecha_caja=not.is.null&external_id=not.is.null&limit=5` +
  `&select=external_id,fecha,fecha_caja,hora,camarero,camarero_nombre,` +
  `total,comensales,cliente,tipo_documento,punto_venta,zona,` +
  `descuento,recargo,turno,formas_pago,tipo_zona`,
)
check('docs query ok', qr.ok, `HTTP ${qr.status}`)
const docs = await qr.json()
check(`got 5 docs`, docs.length === 5, `got ${docs.length}`)
if (docs.length < 5) { console.error('\nFATAL: not enough docs in STG to run smoke test\n'); process.exit(1) }

// ── 3. Pre-upload count ────────────────────────────────────────────────────────
console.log('\n── 3. Pre-upload count ──────────────────────────────────────────')
const cr0 = await restGet(
  `sales_documents?location_id=eq.${STG_LOCATION_ID}&select=count`,
  { Prefer: 'count=exact' },
)
const countBefore = cr0.headers.get('content-range')
console.log(`  before: ${countBefore}`)
check('count readable', !!countBefore)

// ── 4. Build Excel ─────────────────────────────────────────────────────────────
console.log('\n── 4. Build Excel ───────────────────────────────────────────────')
const run     = Date.now()
const tmpPath = path.join(os.tmpdir(), `smoke-upload-${run}.xlsx`)

const rows = docs.map(d => ({
  Sucursal:          'STG',                             // header-only col, value unused by contract
  Numero:            d.external_id,
  Fecha:             d.fecha ?? d.fecha_caja,
  'Fecha Caja':      d.fecha_caja,
  Hora:              d.hora != null
                       ? (Number.isNaN(+d.hora) ? d.hora : +d.hora)
                       : null,
  Camarero:          d.camarero         ?? null,
  'Camarero Nombre': d.camarero_nombre  ?? null,
  Total:             d.total            ?? null,
  Comensales:        d.comensales       ?? null,
  Cliente:           d.cliente          ?? null,
  'Tipo Documento':  d.tipo_documento   ?? null,
  'Punto Venta':     d.punto_venta      ?? null,
  Zona:              d.zona             ?? null,
  Descuento:         d.descuento        ?? 0,
  Recargo:           d.recargo          ?? 0,
  Turno:             d.turno            ?? null,
  'Formas Pago':     d.formas_pago      ?? null,
  'Tipo Zona':       d.tipo_zona        ?? null,
  _run:              run,                               // makes bytes unique → fresh request_hash
}))

const ws  = XLSX.utils.json_to_sheet(rows)
const rng = XLSX.utils.decode_range(ws['!ref'])
for (let R = rng.s.r + 1; R <= rng.e.r; R++) {
  for (let C = rng.s.c; C <= rng.e.c; C++) {
    const cell = ws[XLSX.utils.encode_cell({ r: R, c: C })]
    if (cell && typeof cell.v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(cell.v)) cell.t = 's'
  }
}
const wb = XLSX.utils.book_new()
XLSX.utils.book_append_sheet(wb, ws, 'ventas')
XLSX.writeFile(wb, tmpPath)
check('excel written', fs.existsSync(tmpPath))
console.log(`  path: ${tmpPath}  _run=${run}`)

// ── Main pipeline assertions (with guaranteed cleanup) ─────────────────────────
let p1EventId = null
let p1Hash    = null

try {
  // ── 5. POST dry-run (preview without committing) ──────────────────────────────
  console.log('\n── 5. POST dry-run (?dry_run=true) ──────────────────────────')
  const bufDr  = fs.readFileSync(tmpPath)
  const blobDr = new Blob([bufDr], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const formDr = new FormData()
  formDr.append('sales',       blobDr, `smoke-${run}.xlsx`)
  formDr.append('org_id',      STG_ORG_ID)
  formDr.append('location_id', STG_LOCATION_ID)

  const rDr  = await fetch(`${BASE_URL}/api/upload/maxirest-sales?dry_run=true`, { method: 'POST', body: formDr })
  const bDr  = await rDr.json()
  console.log(`  HTTP ${rDr.status}`)
  console.log(`  ${JSON.stringify(bDr)}`)

  check('dry-run HTTP 200',         rDr.status === 200)
  check('dry-run status=dry_run',   bDr.status === 'dry_run' || bDr.status === 'dry_run_duplicate', `got "${bDr.status}"`)
  check('dry-run dryRun=true',      bDr.dryRun === true)
  check('dry-run wouldCommit field present', 'wouldCommit' in bDr)

  // Verify the table count did NOT change after the dry-run
  const crDr      = await restGet(
    `sales_documents?location_id=eq.${STG_LOCATION_ID}&select=count`,
    { Prefer: 'count=exact' },
  )
  const countAfterDr = crDr.headers.get('content-range')
  check('dry-run: count unchanged', countBefore === countAfterDr, `before=${countBefore} afterDr=${countAfterDr}`)

  // ── 6. POST #1 — full pipeline ───────────────────────────────────────────────
  console.log('\n── 6. POST #1 (full pipeline) ───────────────────────────────')
  const t0   = Date.now()
  const buf  = fs.readFileSync(tmpPath)
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const form = new FormData()
  form.append('sales',       blob, `smoke-${run}.xlsx`)
  form.append('org_id',      STG_ORG_ID)
  form.append('location_id', STG_LOCATION_ID)

  const r1  = await fetch(`${BASE_URL}/api/upload/maxirest-sales`, { method: 'POST', body: form })
  const ms  = Date.now() - t0
  const b1  = await r1.json()
  console.log(`  HTTP ${r1.status}  ${ms}ms`)
  console.log(`  ${JSON.stringify(b1)}`)

  check('HTTP 200',              r1.status === 200)
  check('status=committed',      b1.status === 'committed',         `got "${b1.status}"`)
  check('sales.new=0',           b1.sales?.new === 0,               `got ${b1.sales?.new}`)
  check('sales.updated=5',       b1.sales?.updated === 5,           `got ${b1.sales?.updated}`)
  check('sales.rejected=0',      b1.sales?.rejected === 0,          `got ${b1.sales?.rejected}`)
  check('sales.failed=0',        b1.sales?.failed === 0,            `got ${b1.sales?.failed}`)
  check('dateRange not empty',   !!b1.dateRange,                    `got "${b1.dateRange}"`)
  check('event_id present',      !!b1.event_id)
  check('sales key present',     !!b1.sales,                        'pipeline datasetType key missing')

  p1EventId = b1.event_id
  p1Hash    = b1.request_hash

  if (ms > 10_000) console.warn(`  ⚠ PERFORMANCE WARNING: ${ms}ms exceeds 10s threshold`)
  else             console.log( `  ⚡ ${ms}ms (under 10s)`)

  // ── 7. Count unchanged ───────────────────────────────────────────────────────
  console.log('\n── 7. Count unchanged ───────────────────────────────────────')
  const cr1 = await restGet(
    `sales_documents?location_id=eq.${STG_LOCATION_ID}&select=count`,
    { Prefer: 'count=exact' },
  )
  const countAfter = cr1.headers.get('content-range')
  console.log(`  after:  ${countAfter}`)
  check('count unchanged', countBefore === countAfter, `before=${countBefore} after=${countAfter}`)

  // ── 8. data_freshness recent ─────────────────────────────────────────────────
  console.log('\n── 8. data_freshness updated ────────────────────────────────')
  const fr  = await restGet(
    `data_freshness?location_id=eq.${STG_LOCATION_ID}&dataset=eq.sales_documents&select=last_upload,rows_affected`,
  )
  const frRows = await fr.json()
  console.log(`  ${JSON.stringify(frRows)}`)
  if (frRows.length > 0) {
    const ageMs = Date.now() - new Date(frRows[0].last_upload).getTime()
    check('freshness last_upload < 2 min', ageMs < 120_000, `age=${(ageMs / 1000).toFixed(1)}s`)
  } else {
    check('freshness row exists', false, 'no row for sales_documents')
  }

  // ── 9. POST #2 — idempotency ─────────────────────────────────────────────────
  console.log('\n── 9. POST #2 (duplicate_skipped) ───────────────────────────')
  const buf2  = fs.readFileSync(tmpPath)
  const blob2 = new Blob([buf2], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const form2 = new FormData()
  form2.append('sales',       blob2, `smoke-${run}.xlsx`)
  form2.append('org_id',      STG_ORG_ID)
  form2.append('location_id', STG_LOCATION_ID)

  const r2 = await fetch(`${BASE_URL}/api/upload/maxirest-sales`, { method: 'POST', body: form2 })
  const b2 = await r2.json()
  console.log(`  HTTP ${r2.status}`)
  console.log(`  ${JSON.stringify(b2)}`)

  check('HTTP 200',                    r2.status === 200)
  check('status=duplicate_skipped',   b2.status === 'duplicate_skipped',    `got "${b2.status}"`)
  check('original_event_id matches',  b2.original_event_id === p1EventId,   `got ${b2.original_event_id}`)
  check('request_hash matches',       b2.request_hash === p1Hash)

  // ── 10. Lifecycle in upload_events ───────────────────────────────────────────
  console.log('\n── 10. upload_events lifecycle (POST 1) ─────────────────────')
  const ev    = await restGet(`upload_events?event_id=eq.${p1EventId}&select=event_type,created_at&order=created_at.asc`)
  const evs   = await ev.json()
  const types = evs.map(e => e.event_type)
  console.log(`  ${types.join(' → ')}`)

  check('5 lifecycle events',      types.length === 5,                         `got ${types.length}`)
  check('event[0]=received',       types[0] === 'upload.received',             `got ${types[0]}`)
  check('event[1]=validated',      types[1] === 'upload.validated',            `got ${types[1]}`)
  check('event[2]=parsed',         types[2] === 'upload.parsed',               `got ${types[2]}`)
  check('event[3]=abort_check',    types[3] === 'upload.abort_check',          `got ${types[3]}`)
  check('event[4]=committed',      types[4] === 'upload.committed',            `got ${types[4]}`)

} finally {
  // ── 11. Cleanup (always) ─────────────────────────────────────────────────────
  console.log('\n── 11. Cleanup ──────────────────────────────────────────────')
  try {
    if (fs.existsSync(tmpPath)) { fs.unlinkSync(tmpPath); console.log(`  deleted ${tmpPath}`) }
  } catch (e) { console.warn(`  warning: could not delete ${tmpPath}: ${e}`) }
}

// ── Summary ────────────────────────────────────────────────────────────────────
console.log('\n══ SMOKE SUMMARY ════════════════════════════════════════════════')
console.log(`  passed: ${passed}   failed: ${failed}`)
if (failed === 0) {
  console.log('  ✅ ALL CHECKS PASSED\n')
  process.exit(0)
} else {
  console.error(`  ❌ ${failed} CHECK(S) FAILED\n`)
  process.exit(1)
}
