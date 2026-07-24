/**
 * SOLO LECTURA. Lista los roles con EXECUTE grant sobre RPCs por nombre, desde
 * STG. Usar antes de migrar una función existente para preservar sus grants
 * exactos en el CREATE OR REPLACE.
 * Uso: npx tsx scripts/diag/rpc-grants-dump.ts nombre_funcion_1 nombre_funcion_2 ...
 */
import * as fs from 'fs'
import * as path from 'path'
function loadEnvFile(file: string): Record<string, string> {
  const envPath = path.resolve(process.cwd(), file)
  return Object.fromEntries(
    fs.readFileSync(envPath, 'utf8').split('\n')
      .filter(l => l.trim() && !l.startsWith('#') && l.includes('='))
      .map(l => { const [k, ...v] = l.split('='); return [k.trim(), v.join('=').trim()] }),
  )
}
function projectRefFromUrl(url?: string): string | undefined {
  return url?.match(/^https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1]
}
async function sqlQuery(ref: string, token: string, query: string): Promise<Record<string, unknown>[]> {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({ query }),
  })
  if (!res.ok) throw new Error(`SQL error ${res.status}: ${await res.text()}`)
  return res.json() as Promise<Record<string, unknown>[]>
}
async function main() {
  const stgEnv = loadEnvFile('.env.staging')
  const ref = stgEnv.PROJECT_REF ?? projectRefFromUrl(stgEnv.NEXT_PUBLIC_SUPABASE_URL)
  const token = stgEnv.SUPABASE_ACCESS_TOKEN!
  const names = process.argv.slice(2)
  const rows = await sqlQuery(ref, token, `
    SELECT p.proname,
      (SELECT string_agg(DISTINCT grantee::text, ',') FROM information_schema.routine_privileges
       WHERE routine_schema='public' AND routine_name=p.proname AND privilege_type='EXECUTE') AS grantees
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname='public' AND p.proname = ANY(ARRAY['${names.join("','")}'])
    ORDER BY p.proname
  `)
  for (const r of rows) console.log(`${r.proname}: ${r.grantees}`)
}
main().catch(e => { console.error('Fatal:', e); process.exit(1) })
