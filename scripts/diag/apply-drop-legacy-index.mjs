/**
 * Apply the drop-legacy-indexes migration to STG and verify the result.
 * Run: node --env-file=.env.local scripts/diag/apply-drop-legacy-index.mjs
 * SECURITY: never prints key values.
 */

import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import path from 'path'

const SUPABASE_URL   = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY    = process.env.SUPABASE_SERVICE_ROLE_KEY
const ACCESS_TOKEN   = process.env.SUPABASE_ACCESS_TOKEN

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const match = SUPABASE_URL.match(/https:\/\/([a-z0-9]+)\.supabase\.co/)
const projectRef = match?.[1]
console.log('Project ref:', projectRef)

const svcHeaders = {
  'Content-Type':  'application/json',
  'apikey':        SERVICE_KEY,
  'Authorization': `Bearer ${SERVICE_KEY}`,
}

// Step 1: Create a helper RPC function that lists current unique indexes
const createHelperSQL = `
CREATE OR REPLACE FUNCTION public._diag_list_sales_indexes()
RETURNS TABLE(indexname text, indexdef text)
LANGUAGE sql SECURITY DEFINER
AS $$
  SELECT indexname::text, indexdef::text
  FROM pg_indexes
  WHERE tablename = 'sales_documents' AND schemaname = 'public' AND indexdef ILIKE '%unique%'
  ORDER BY indexname;
$$;
GRANT EXECUTE ON FUNCTION public._diag_list_sales_indexes() TO service_role;
`

const dropHelperSQL = `DROP FUNCTION IF EXISTS public._diag_list_sales_indexes();`

// Try to apply SQL via management API
async function runSQL(sql, label) {
  if (!ACCESS_TOKEN) {
    console.log(`[${label}] No SUPABASE_ACCESS_TOKEN — cannot run via management API`)
    return null
  }
  const res = await fetch(
    `https://api.supabase.com/v1/projects/${projectRef}/database/query`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${ACCESS_TOKEN}` },
      body: JSON.stringify({ query: sql }),
    },
  )
  if (!res.ok) {
    const text = await res.text()
    console.log(`[${label}] Management API error (${res.status}):`, text.slice(0, 200))
    return null
  }
  return res.json()
}

// Try to list indexes via existing RPC helper
async function listIndexesViaRPC() {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/_diag_list_sales_indexes`, {
    method: 'POST',
    headers: svcHeaders,
    body: JSON.stringify({}),
  })
  if (!res.ok) return null
  return res.json()
}

console.log('\n=== Step 1: List current unique indexes ===')

// Try management API first
const createResult = await runSQL(createHelperSQL, 'create-helper')
if (createResult !== null) {
  console.log('Helper function created via management API')
  const rows = await listIndexesViaRPC()
  if (rows) {
    console.log('Current unique indexes on sales_documents:')
    for (const r of rows) {
      console.log(`  [UNIQUE] ${r.indexname}`)
      console.log(`    ${r.indexdef}`)
    }
  }
} else {
  console.log('Falling back to RPC (function may already exist)...')
  const rows = await listIndexesViaRPC()
  if (rows) {
    console.log('Current unique indexes on sales_documents:')
    for (const r of rows) {
      console.log(`  [UNIQUE] ${r.indexname}`)
      console.log(`    ${r.indexdef}`)
    }
  } else {
    console.log('Could not list indexes automatically.')
    console.log('\nRun this query in the Supabase Dashboard SQL editor to see indexes:')
    console.log(`SELECT indexname, indexdef FROM pg_indexes`)
    console.log(`WHERE tablename = 'sales_documents' AND schemaname = 'public'`)
    console.log(`AND indexdef ILIKE '%unique%' ORDER BY indexname;`)
  }
}

console.log('\n=== Step 2: Apply drop-legacy-index migration ===')

const migrationPath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../supabase/migrations/20260606000001_drop_legacy_5field_unique.sql',
)
const migrationSQL = readFileSync(migrationPath, 'utf8')

const applyResult = await runSQL(migrationSQL, 'apply-migration')
if (applyResult !== null) {
  console.log('Migration applied successfully via management API')

  console.log('\n=== Step 3: Verify — list remaining unique indexes ===')
  const after = await listIndexesViaRPC()
  if (after) {
    console.log('Remaining unique indexes:')
    for (const r of after) {
      const isTicketHash = r.indexname === 'idx_sales_documents_ticket_hash_unique'
      console.log(`  [${isTicketHash ? 'KEEP' : 'UNEXPECTED'}] ${r.indexname}`)
      console.log(`    ${r.indexdef}`)
    }
    if (after.every(r => r.indexname === 'idx_sales_documents_ticket_hash_unique' || r.indexname === 'sales_documents_pkey')) {
      console.log('\nSUCCESS: only ticket_hash_unique remains as uniqueness source.')
    } else {
      console.log('\nWARNING: unexpected unique indexes remain — review above.')
    }
  }

  // Clean up helper
  await runSQL(dropHelperSQL, 'drop-helper')
  console.log('Helper function cleaned up.')
} else {
  console.log('\nMigration could not be applied automatically.')
  console.log('Run the following SQL in the Supabase Dashboard SQL editor:')
  console.log('\n---\n' + migrationSQL + '\n---')
}
