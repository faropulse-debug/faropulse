import fs from 'fs'
import path from 'path'
import { fetchSchemaState } from './lib/supabase-api'
import { evaluateSchemaDiff, DiffMode, validateShadowFreshness } from './lib/schema-engine'

const PROJECT_REF = process.env.PROJECT_REF
const SUPABASE_ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN
const SHADOW_DB_URL = process.env.SHADOW_DB_URL

if (!PROJECT_REF || !SUPABASE_ACCESS_TOKEN) {
  console.error('❌  Faltan PROJECT_REF o SUPABASE_ACCESS_TOKEN')
  process.exit(1)
}
if (!SHADOW_DB_URL) {
  console.error('❌  Falta SHADOW_DB_URL (ej. postgresql://postgres:postgres@127.0.0.1:54322/postgres)')
  process.exit(1)
}

// Parse args
const args = process.argv.slice(2)
let mode: DiffMode = 'post-apply'
if (args.includes('--mode')) {
  const idx = args.indexOf('--mode')
  if (idx + 1 < args.length) {
    const val = args[idx + 1]
    if (val === 'ci' || val === 'pre-deploy' || val === 'post-apply') {
      mode = val
    }
  }
}

async function checkShadowFresca(appliedMigrations: string[]) {
  const migrationsDir = path.join(process.cwd(), 'supabase', 'migrations')
  if (!fs.existsSync(migrationsDir)) return // If no dir, nothing to check

  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .map(f => f.split('_')[0]) // version prefix

  try {
    validateShadowFreshness(files, appliedMigrations)
  } catch (err: any) {
    console.error(err.message)
    process.exit(1)
  }
}

async function run() {
  console.log(`🔍 Extrayendo esquema esperado (Shadow DB local)...`)
  const expectedSchema = await fetchSchemaState({ connectionString: SHADOW_DB_URL as string })
  
  await checkShadowFresca(expectedSchema.applied_migrations)

  console.log(`🌍 Extrayendo esquema real (Proyecto: ${PROJECT_REF})...`)
  const actualSchema = await fetchSchemaState({ projectRef: PROJECT_REF as string, token: SUPABASE_ACCESS_TOKEN as string })

  console.log(`\n⚖️  Comparando (Modo: ${mode})...\n`)
  const findings = evaluateSchemaDiff(expectedSchema, actualSchema, mode)

  let hasErrors = false
  let warnings = 0
  let infos = 0

  for (const f of findings) {
    const icon = f.level === 'CRITICAL' ? '🔴' : f.level === 'ERROR' ? '🔴' : f.level === 'WARNING' ? '🟡' : '🔵'
    console.log(`${icon} [${f.level}] ${f.type} en ${f.objectType} ${f.objectName}`)
    console.log(`   ${f.detail}`)
    
    if (f.level === 'CRITICAL' || f.level === 'ERROR') hasErrors = true
    if (f.level === 'WARNING') warnings++
    if (f.level === 'INFO') infos++
  }

  console.log('\n--- Resumen ---')
  if (findings.length === 0) {
    console.log('✅ Esquemáticamente perfectos. Sin hallazgos.')
  } else {
    console.log(`Total hallazgos: ${findings.length}`)
    if (hasErrors) console.log('❌ Auditoría falló (CRITICAL/ERROR).')
    else console.log('✅ Auditoría pasó sin errores críticos.')
  }

  if (hasErrors) {
    process.exit(1)
  }
}

run().catch(e => {
  console.error('Fatal:', e)
  process.exit(1)
})
