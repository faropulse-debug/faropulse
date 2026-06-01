/**
 * E2E upload test — posts both Excel files to /api/upload/sales on STG.
 * Usage:
 *   npx tsx scripts/upload-e2e-test.ts --ventas "path/to/Ventas.xlsx" --items "path/to/Detalle.xlsx"
 *
 * Does NOT execute automatically — run only when explicitly asked (Prompt #2).
 */

import * as fs   from 'fs'
import * as path from 'path'

// ── Config ────────────────────────────────────────────────────────────────────

const STG_URL     = 'https://faropulse-git-develop-faropulse-debugs-projects.vercel.app'
const ENDPOINT    = `${STG_URL}/api/upload/sales`
const LOCATION_ID = 'bbbbbbbb-0000-0000-0000-000000000001'
const ORG_ID      = 'aaaaaaaa-0000-0000-0000-000000000001'

// ── Args ─────────────────────────────────────────────────────────────────────

function parseArgs(): { ventas: string | null; items: string | null } {
  const args = process.argv.slice(2)
  let ventas: string | null = null
  let items:  string | null = null
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--ventas' && args[i + 1]) ventas = args[++i]
    if (args[i] === '--items'  && args[i + 1]) items  = args[++i]
  }
  return { ventas, items }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function run() {
  const { ventas, items } = parseArgs()

  if (!ventas && !items) {
    console.error('❌  Provide at least one of --ventas <path> or --items <path>')
    process.exit(1)
  }

  // Verify files exist before attempting upload
  for (const [label, p] of [['ventas', ventas], ['items', items]] as [string, string | null][]) {
    if (!p) continue
    const abs = path.resolve(p)
    if (!fs.existsSync(abs)) {
      console.error(`❌  File not found (${label}): ${abs}`)
      process.exit(1)
    }
    const { size } = fs.statSync(abs)
    console.log(`✓  ${label}: ${abs} (${size} bytes)`)
  }

  // Build FormData
  const form = new FormData()
  form.append('location_id', LOCATION_ID)
  form.append('org_id',      ORG_ID)

  if (ventas) {
    const abs  = path.resolve(ventas)
    const buf  = fs.readFileSync(abs)
    const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    form.append('ventas', blob, path.basename(abs))
    console.log(`\nAttaching ventas: ${path.basename(abs)}`)
  }

  if (items) {
    const abs  = path.resolve(items)
    const buf  = fs.readFileSync(abs)
    const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    form.append('items', blob, path.basename(abs))
    console.log(`Attaching items:  ${path.basename(abs)}`)
  }

  console.log(`\nPOST ${ENDPOINT}`)
  console.log(`    location_id=${LOCATION_ID}`)
  console.log(`    org_id=${ORG_ID}`)

  const startMs = Date.now()
  const res     = await fetch(ENDPOINT, { method: 'POST', body: form })
  const elapsed = Date.now() - startMs

  console.log(`\n── Response ─────────────────────────────────────────────────`)
  console.log(`Status:  ${res.status} ${res.statusText}  (${elapsed}ms)`)

  const text = await res.text()
  let body: unknown
  try {
    body = JSON.parse(text)
    console.log('Body:')
    console.log(JSON.stringify(body, null, 2))
  } catch {
    console.log('Body (raw):')
    console.log(text)
  }

  if (!res.ok) {
    console.error(`\n❌  Upload FAILED (status ${res.status})`)
    process.exit(1)
  }

  console.log('\n✅  Upload OK')
}

run().catch(e => { console.error('Fatal:', e); process.exit(1) })
