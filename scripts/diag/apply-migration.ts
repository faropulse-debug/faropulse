/**
 * Aplica un archivo .sql a STG vía Management API (mismo mecanismo que
 * scripts/estado-real.ts y scripts/diag/apply-drop-legacy-index.mjs, generalizado
 * a cualquier archivo). Reemplaza copiar/pegar a mano en el SQL Editor.
 *
 * Seguridad: solo lee .env.staging — no tiene forma de apuntar a PROD por
 * accidente (no lee .env.local.prod). Migraciones a PROD siguen siendo manuales.
 *
 * Uso: npx tsx scripts/diag/apply-migration.ts supabase/migrations/<archivo>.sql
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
async function main() {
  const file = process.argv[2]
  if (!file) throw new Error('Uso: apply-migration.ts <archivo.sql>')
  const sql = fs.readFileSync(file, 'utf8')

  const stgEnv = loadEnvFile('.env.staging')
  const ref = stgEnv.PROJECT_REF ?? projectRefFromUrl(stgEnv.NEXT_PUBLIC_SUPABASE_URL)
  const token = stgEnv.SUPABASE_ACCESS_TOKEN!
  console.log(`Aplicando ${file} a STG (${ref})...`)

  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({ query: sql }),
  })
  if (!res.ok) {
    console.error(`ERROR ${res.status}:`, await res.text())
    process.exit(1)
  }
  console.log('OK — aplicado sin error.')
}
main().catch(e => { console.error('Fatal:', e); process.exit(1) })
