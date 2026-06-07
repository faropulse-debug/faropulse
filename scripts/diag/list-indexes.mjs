/**
 * List indexes on sales_documents by creating a temporary helper RPC function.
 * Run: node --env-file=.env.local scripts/diag/list-indexes.mjs
 * SECURITY: never prints key values.
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing env vars')
  process.exit(1)
}

const match = SUPABASE_URL.match(/https:\/\/([a-z0-9]+)\.supabase\.co/)
console.log('Project ref:', match?.[1] ?? 'unknown')

const svcHeaders = {
  'Content-Type':  'application/json',
  'apikey':        SERVICE_KEY,
  'Authorization': `Bearer ${SERVICE_KEY}`,
}

// Step 1: create a helper function that exposes pg_indexes
const createFn = `
CREATE OR REPLACE FUNCTION public._diag_list_sales_indexes()
RETURNS TABLE(indexname text, indexdef text, is_unique boolean)
LANGUAGE sql SECURITY DEFINER
AS $$
  SELECT indexname::text, indexdef::text, indexdef ILIKE '%unique%' AS is_unique
  FROM pg_indexes
  WHERE tablename = 'sales_documents' AND schemaname = 'public'
  ORDER BY indexname;
$$;
GRANT EXECUTE ON FUNCTION public._diag_list_sales_indexes() TO service_role;
`

// Use the Supabase SQL endpoint via the query RPC if available, or create via migration
// Try calling an existing function first; if it doesn't exist, we need to create it differently.

// Attempt to call the function (will 404 if it doesn't exist)
let res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/_diag_list_sales_indexes`, {
  method: 'POST',
  headers: svcHeaders,
  body: JSON.stringify({}),
})

if (res.status === 404) {
  console.log('Helper function not found — creating it via exec_sql fallback...')

  // Supabase doesn't have a public exec_sql endpoint by default.
  // Try using the pg_dump or direct SQL approach.
  // Fall back to querying information_schema.table_constraints which IS accessible
  console.log('\nFallback: querying information_schema...')
  const icRes = await fetch(
    `${SUPABASE_URL}/rest/v1/information_schema.key_column_usage?table_name=eq.sales_documents&table_schema=eq.public&select=constraint_name,column_name,ordinal_position`,
    { headers: { ...svcHeaders, 'Content-Type': 'application/json' } },
  )
  if (icRes.ok) {
    const cols = await icRes.json()
    console.log('Key columns:\n', JSON.stringify(cols, null, 2))
  } else {
    console.log('information_schema not accessible via REST. Status:', icRes.status)
  }

  console.log('\nRecommendation: run this SQL in the Supabase Dashboard SQL editor:')
  console.log(`
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'sales_documents' AND schemaname = 'public'
ORDER BY indexname;
`)
  process.exit(0)
}

if (!res.ok) {
  const body = await res.text()
  console.error(`RPC call failed (${res.status}):`, body.slice(0, 300))
  process.exit(1)
}

const rows = await res.json()
console.log('\n=== Indexes on sales_documents ===')
for (const row of rows) {
  console.log(`\n[${row.is_unique ? 'UNIQUE' : 'plain '}] ${row.indexname}`)
  console.log(`  ${row.indexdef}`)
}
console.log(`\nTotal: ${rows.length} index(es)`)

// Clean up helper function
await fetch(`${SUPABASE_URL}/rest/v1/rpc/_diag_drop_helper`, {
  method: 'POST',
  headers: svcHeaders,
  body: JSON.stringify({}),
}).catch(() => {})
