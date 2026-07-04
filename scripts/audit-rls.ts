/**
 * Audit de RLS: compara el estado real de Row Level Security en Supabase
 * contra un baseline esperado (EXPECTED).
 * Uso: PROJECT_REF=... SUPABASE_ACCESS_TOKEN=... npx tsx scripts/audit-rls.ts
 * Exit code 1 si hay hallazgos CRÍTICOS (RLS desactivado o política esperada faltante).
 */

const PROJECT_REF          = process.env.PROJECT_REF
const SUPABASE_ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN

if (!PROJECT_REF || !SUPABASE_ACCESS_TOKEN) {
  console.error('❌  Faltan PROJECT_REF o SUPABASE_ACCESS_TOKEN')
  process.exit(1)
}

// ── Baseline esperado (PROD) ──────────────────────────────────────────────────

type ExpectedTable = { rls: boolean; policies: string[] }

const EXPECTED: Record<string, ExpectedTable> = {
  calendar_context:  { rls: true, policies: ['calendar_context_select'] },
  financial_results: { rls: true, policies: ['financial_results_delete', 'financial_results_insert', 'financial_results_select'] },
  locations:         { rls: true, policies: ['locations_select_own_org'] },
  memberships:       { rls: true, policies: ['memberships_select_own'] },
  organizations:     { rls: true, policies: ['organizations_select_own'] },
  product_prices:    { rls: true, policies: ['product_prices_delete', 'product_prices_insert', 'product_prices_select'] },
  profiles:          { rls: true, policies: ['profiles_select_own', 'profiles_update_own'] },
  recipes:           { rls: true, policies: ['recipes_delete', 'recipes_insert', 'recipes_select'] },
  sales_documents:   { rls: true, policies: ['sales_documents_delete', 'sales_documents_insert', 'sales_documents_select'] },
  sales_items:       { rls: true, policies: ['members can delete sales_items', 'members can insert sales_items', 'members can select sales_items'] },
  schema_migrations: { rls: true, policies: [] },
  stock_movements:   { rls: true, policies: ['stock_movements_delete', 'stock_movements_insert', 'stock_movements_select'] },
  upload_events:     { rls: true, policies: ['upload_events_delete', 'upload_events_insert', 'upload_events_select'] },
  uploads:           { rls: true, policies: ['uploads_insert', 'uploads_select'] },
}

// ── Management API ────────────────────────────────────────────────────────────

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

// ── Estado real ────────────────────────────────────────────────────────────────

type ActualPolicy = { name: string; cmd: string; roles: string[] }
type ActualTable  = { rls: boolean; policies: ActualPolicy[] }

function isRlsEnabled(value: unknown): boolean {
  return value === true || value === 't'
}

async function fetchActualState(): Promise<Record<string, ActualTable>> {
  const tables = await sql(`
    SELECT tablename, rowsecurity
    FROM pg_tables
    WHERE schemaname = 'public'
  `)

  const policies = await sql(`
    SELECT tablename, policyname, cmd, array_to_string(roles, ',') AS roles
    FROM pg_policies
    WHERE schemaname = 'public'
  `)

  const state: Record<string, ActualTable> = {}

  for (const row of tables) {
    const name = row.tablename as string
    state[name] = { rls: isRlsEnabled(row.rowsecurity), policies: [] }
  }

  for (const row of policies) {
    const name = row.tablename as string
    if (!state[name]) state[name] = { rls: false, policies: [] }
    state[name].policies.push({
      name:  row.policyname as string,
      cmd:   row.cmd as string,
      roles: String(row.roles ?? '').split(',').filter(Boolean),
    })
  }

  return state
}

// ── Run ───────────────────────────────────────────────────────────────────────

async function run() {
  const actualState = await fetchActualState()

  const tablesWithoutRls: string[]   = []
  const missingPolicies: string[]    = []
  const unexpectedPolicies: string[] = []

  const expectedTableNames = Object.keys(EXPECTED)

  for (const tableName of expectedTableNames) {
    const expected = EXPECTED[tableName]
    const actual   = actualState[tableName]

    if (!actual) {
      tablesWithoutRls.push(`${tableName} (tabla no encontrada en public)`)
      continue
    }

    if (expected.rls && !actual.rls) {
      tablesWithoutRls.push(tableName)
    }

    for (const policyName of expected.policies) {
      const found = actual.policies.some(p => p.name === policyName)
      if (!found) {
        missingPolicies.push(`${tableName}.${policyName}`)
      }
    }
  }

  for (const [tableName, actual] of Object.entries(actualState)) {
    const expected = EXPECTED[tableName]
    for (const actualPolicy of actual.policies) {
      const expectedMatch = expected?.policies.includes(actualPolicy.name)
      if (!expectedMatch) {
        unexpectedPolicies.push(
          `${tableName}.${actualPolicy.name} (cmd=${actualPolicy.cmd}, roles=${actualPolicy.roles.join('/')})`
        )
      }
    }
  }

  // ── Reporte ───────────────────────────────────────────────────────────────

  console.log(`\nRLS Audit — proyecto ${PROJECT_REF}\n`)

  console.log(`🔴 Tablas sin RLS activo (CRÍTICO): ${tablesWithoutRls.length}`)
  for (const t of tablesWithoutRls) console.log(`   - ${t}`)

  console.log(`\n🔴 Políticas esperadas que faltan (CRÍTICO): ${missingPolicies.length}`)
  for (const p of missingPolicies) console.log(`   - ${p}`)

  console.log(`\n🟡 Políticas fuera del baseline (revisar): ${unexpectedPolicies.length}`)
  for (const p of unexpectedPolicies) console.log(`   - ${p}`)

  if (expectedTableNames.length === 0) {
    console.log('\n⚠️  EXPECTED está vacío — completar el baseline antes de usar este audit en CI.\n')
  }

  const critical = tablesWithoutRls.length + missingPolicies.length

  if (critical > 0) {
    console.error(`\n❌  ${critical} hallazgo(s) CRÍTICO(s)\n`)
    process.exit(1)
  }

  console.log('\n✅  Sin hallazgos críticos\n')
}

run().catch(e => { console.error('Fatal:', e); process.exit(1) })
