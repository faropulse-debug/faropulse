/**
 * Backfill: recompute ticket_hash for all sales_documents rows using the
 * money-precision-normalized hash function (toFixed(2) on total/descuento/recargo).
 *
 * Usage:
 *   node --env-file=.env.local scripts/backfill/recompute-ticket-hash.mjs --dry-run
 *   node --env-file=.env.local scripts/backfill/recompute-ticket-hash.mjs
 *
 * SECURITY: never prints key values.
 */

import { createHash } from 'crypto'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const DRY_RUN   = process.argv.includes('--dry-run')
const PAGE_SIZE = 1000

console.log(`Mode: ${DRY_RUN ? 'DRY-RUN (no writes)' : 'LIVE (will update rows)'}`)
console.log(`Project: ${SUPABASE_URL.match(/https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1] ?? 'unknown'}`)
console.log(`Page size: ${PAGE_SIZE}\n`)

const svcHeaders = {
  'Content-Type':  'application/json',
  'apikey':        SERVICE_KEY,
  'Authorization': `Bearer ${SERVICE_KEY}`,
}

// Mirrors generate-ticket-hash.ts with money normalization.
const money = (n) => (n == null ? '' : Number(n).toFixed(2))

function computeHash(row) {
  const parts = [
    row.external_id    == null ? '' : String(row.external_id),
    row.fecha_caja     == null ? '' : String(row.fecha_caja),
    row.hora           == null ? '' : String(row.hora),
    row.camarero       == null ? '' : String(row.camarero),
    money(row.total),
    row.comensales     == null ? '' : String(row.comensales),
    row.cliente        == null ? '' : String(row.cliente),
    row.tipo_documento == null ? '' : String(row.tipo_documento),
    row.punto_venta    == null ? '' : String(row.punto_venta),
    row.zona           == null ? '' : String(row.zona),
    money(row.descuento),
    money(row.recargo),
  ]
  return createHash('sha256').update(parts.join('|')).digest('hex')
}

async function fetchPage(offset) {
  const cols = 'id,external_id,fecha_caja,hora,camarero,total,comensales,cliente,tipo_documento,punto_venta,zona,descuento,recargo,ticket_hash,location_id'
  const url  = `${SUPABASE_URL}/rest/v1/sales_documents?select=${cols}&order=id&offset=${offset}&limit=${PAGE_SIZE}`
  const res  = await fetch(url, { headers: svcHeaders })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Fetch page ${offset} failed (${res.status}): ${text.slice(0, 200)}`)
  }
  return res.json()
}

async function updateRow(id, newHash) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/sales_documents?id=eq.${id}`,
    {
      method:  'PATCH',
      headers: { ...svcHeaders, 'Prefer': 'return=minimal' },
      body:    JSON.stringify({ ticket_hash: newHash }),
    },
  )
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`PATCH ${id} failed (${res.status}): ${text.slice(0, 200)}`)
  }
}

// Main loop
let offset    = 0
let total     = 0
let changed   = 0
let unchanged = 0
let errors    = 0

// Track new hashes seen in this run to detect collisions within the batch
const seenNewHashes = new Map() // newHash → row id
const collisions    = []

console.log('Reading sales_documents ...\n')

while (true) {
  const rows = await fetchPage(offset)
  if (rows.length === 0) break

  total += rows.length

  for (const row of rows) {
    const newHash = computeHash(row)
    const oldHash = row.ticket_hash

    if (newHash === oldHash) {
      unchanged++
      continue
    }

    // Check for collisions: two distinct rows computing to the same new hash
    if (seenNewHashes.has(newHash)) {
      const otherId = seenNewHashes.get(newHash)
      collisions.push({ id: row.id, conflictsWithId: otherId, newHash })
      console.warn(`COLLISION: row ${row.id} and ${otherId} both compute to hash ${newHash.slice(0, 16)}...`)
      errors++
      continue
    }
    seenNewHashes.set(newHash, row.id)

    changed++
    if (DRY_RUN) {
      console.log(`[DRY] id=${row.id} | old=${(oldHash ?? 'null').slice(0, 16)}... → new=${newHash.slice(0, 16)}...`)
    } else {
      try {
        await updateRow(row.id, newHash)
        console.log(`[UPD] id=${row.id} | ${(oldHash ?? 'null').slice(0, 16)}... → ${newHash.slice(0, 16)}...`)
      } catch (err) {
        console.error(`[ERR] id=${row.id}:`, err.message)
        errors++
      }
    }
  }

  offset += rows.length
  if (rows.length < PAGE_SIZE) break

  process.stdout.write(`  processed ${offset} rows so far...\r`)
}

console.log('\n=== RESULT ===')
console.log(`Total rows read  : ${total}`)
console.log(`Unchanged        : ${unchanged}`)
console.log(`Changed          : ${changed}`)
console.log(`Collisions       : ${collisions.length}`)
console.log(`Errors           : ${errors}`)

if (collisions.length > 0) {
  console.log('\nCollision details (conceptual duplicates — review manually):')
  for (const c of collisions) {
    console.log(`  row ${c.id} conflicts with ${c.conflictsWithId} on hash ${c.newHash.slice(0, 16)}...`)
  }
}

if (DRY_RUN && changed > 0) {
  console.log(`\nRun without --dry-run to apply ${changed} update(s).`)
}

if (!DRY_RUN && errors === 0) {
  console.log('\nBackfill complete. All ticket_hash values use normalized money precision.')
}
