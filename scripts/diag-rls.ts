/**
 * Diagnóstico de RLS: estado real de RLS y políticas para un set de tablas clave.
 * SOLO LECTURA — únicamente SELECTs sobre pg_class y pg_policies. No escribe nada.
 * Uso: PROJECT_REF=... SUPABASE_ACCESS_TOKEN=... npx tsx scripts/diag-rls.ts
 */

export {} // aísla este archivo como módulo — evita colisión de scope global con scripts/audit-rls.ts

const PROJECT_REF          = process.env.PROJECT_REF
const SUPABASE_ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN

if (!PROJECT_REF || !SUPABASE_ACCESS_TOKEN) {
  console.error('❌  Faltan PROJECT_REF o SUPABASE_ACCESS_TOKEN')
  process.exit(1)
}

const TABLES = [
  'memberships',
  'organizations',
  'profiles',
  'sales_items',
  'upload_events',
  'sales_documents',
  'financial_results',
  'uploads',
  'location_pos_config',
]

async function sql(query: string): Promise<Record<string, unknown>[]> {
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${SUPABASE_ACCESS_TOKEN}`,
    },
    body: JSON.stringify({ query }),
  })
  if (!res.ok) throw new Error(`SQL error ${res.status}: ${await res.text()}`)
  return res.json() as Promise<Record<string, unknown>[]>
}

type RlsRow    = { tablename: string; rls_enabled: boolean; rls_forced: boolean }
type PolicyRow = { tablename: string; policyname: string; cmd: string; roles: string; using_expr: string | null; with_check: string | null }

async function run() {
  console.log(`\nRLS Diagnóstico — proyecto ${PROJECT_REF}\n`)

  // (a) RLS enabled sí/no para las tablas clave
  const rlsRows = (await sql(`
    SELECT c.relname AS tablename, c.relrowsecurity AS rls_enabled, c.relforcerowsecurity AS rls_forced
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = ANY(ARRAY[${TABLES.map(t => `'${t}'`).join(',')}])
    ORDER BY c.relname
  `)) as unknown as RlsRow[]

  console.log('── (a) RLS enabled ──────────────────────────────────────────\n')
  for (const t of TABLES) {
    const row = rlsRows.find(r => r.tablename === t)
    if (!row) {
      console.log(`   - ${t}: tabla no encontrada en public`)
    } else {
      console.log(`   - ${t}: ${row.rls_enabled ? 'SÍ' : 'NO'}${row.rls_forced ? ' (forced)' : ''}`)
    }
  }

  // (b) políticas reales por tabla
  const policyRows = (await sql(`
    SELECT tablename, policyname, cmd, roles, qual AS using_expr, with_check
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = ANY(ARRAY[${TABLES.map(t => `'${t}'`).join(',')}])
    ORDER BY tablename, policyname
  `)) as unknown as PolicyRow[]

  console.log('\n── (b) Políticas reales por tabla ───────────────────────────\n')
  for (const t of TABLES) {
    const rows = policyRows.filter(r => r.tablename === t)
    console.log(`   ${t}: ${rows.length} política(s)`)
    for (const p of rows) {
      console.log(`     - ${p.policyname} | cmd=${p.cmd} | roles=${p.roles} | USING: ${p.using_expr ?? '(none)'}`)
    }
  }

  // (c) toda policy con roles={anon} en todo public
  const anonRows = (await sql(`
    SELECT tablename, policyname, cmd, roles, qual AS using_expr, with_check
    FROM pg_policies
    WHERE schemaname = 'public' AND roles::text LIKE '%anon%'
    ORDER BY tablename, policyname
  `)) as unknown as PolicyRow[]

  console.log('\n── (c) Políticas con roles={anon} (todo public) ─────────────\n')
  if (anonRows.length === 0) {
    console.log('   (ninguna)')
  } else {
    for (const p of anonRows) {
      console.log(`   - ${p.tablename}.${p.policyname} | cmd=${p.cmd} | roles=${p.roles} | USING: ${p.using_expr ?? '(none)'}`)
    }
  }

  console.log('')
}

run().catch(e => { console.error('Fatal:', e); process.exit(1) })
