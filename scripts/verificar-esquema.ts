/**
 * Verificar esquema STG vs PROD — compara la estructura real de las dos
 * bases, no los datos. SOLO LECTURA en los dos ambientes, siempre.
 *
 * Origen: la semana del 2026-09-01 una migración se aplicó a mano en PROD
 * antes que en STG (al revés de la doctrina — ver docs/PROCEDIMIENTO-MIGRACIONES.md).
 * Nadie lo detectó hasta que un upload rompió con PGRST204 (columna no
 * encontrada en el cache de esquema de PostgREST). No había ninguna
 * herramienta que comparara la ESTRUCTURA entre ambientes — invariante-stg-prod.ts
 * (Capa 6) y diff-item-hashes.ts (Capa 7) comparan DATOS, no esquema.
 *
 * Reutiliza fetchSchemaState() y evaluateSchemaDiff() de
 * scripts/lib/supabase-api.ts / schema-engine.ts — la misma maquinaria que
 * ya usa audit-schema.ts para comparar un ambiente real contra el esquema
 * esperado (Shadow DB). Acá los dos lados son ambientes reales: STG se pasa
 * como "expected" y PROD como "actual", porque la doctrina dice que STG se
 * migra primero — así que STG es "lo que PROD debería tener". Con esa
 * asignación:
 *   - algo en PROD que STG no tiene  -> DRIFT ("PROD se adelantó" o "alguien
 *     tocó PROD a mano" — el caso real de esta semana)
 *   - algo en STG que PROD no tiene  -> MISSING ("falta promover a PROD")
 *
 * evaluateSchemaDiff ya cubre columnas/constraints/índices/funciones
 * (existencia + tipo/nullability para columnas, definición para
 * constraints/índices). Lo único que no cubre son triggers y políticas RLS
 * — se agregan acá mismo, como chequeo de existencia (mismo criterio que
 * pide la tarea: "en la misma condición" que constraints/índices), sin
 * tocar schema-engine.ts/supabase-api.ts para no arriesgar audit-schema.ts.
 *
 * Uso:
 *   npx tsx scripts/verificar-esquema.ts
 *
 * Config (mismo patrón que scripts/invariante-stg-prod.ts):
 *   - STG:  PROJECT_REF (o derivado de NEXT_PUBLIC_SUPABASE_URL) y
 *           SUPABASE_ACCESS_TOKEN desde .env.staging
 *   - PROD: ídem desde .env.local.prod
 *   Override manual: STG_PROJECT_REF / STG_SUPABASE_ACCESS_TOKEN /
 *                     PROD_PROJECT_REF / PROD_SUPABASE_ACCESS_TOKEN
 *
 * Exit code 1 si hay cualquier divergencia (columnas, funciones, triggers,
 * políticas, constraints, índices), igual que invariante-stg-prod.ts.
 * Sin modo parcial: sin los dos ambientes no hay nada que comparar.
 */

import * as fs from 'fs'
import * as path from 'path'
import { executeSql, fetchSchemaState, type SqlConfig } from './lib/supabase-api'
import { evaluateSchemaDiff, type SchemaFinding } from './lib/schema-engine'

// ── Env loading (idéntico a scripts/invariante-stg-prod.ts) ────────────────

function loadEnvFile(file: string): Record<string, string> {
  const envPath = path.resolve(process.cwd(), file)
  if (!fs.existsSync(envPath)) return {}
  return Object.fromEntries(
    fs.readFileSync(envPath, 'utf8')
      .split('\n')
      .filter(l => l.trim() && !l.startsWith('#') && l.includes('='))
      .map(l => { const [k, ...v] = l.split('='); return [k.trim(), v.join('=').trim()] }),
  )
}

function projectRefFromUrl(url?: string): string | undefined {
  return url?.match(/^https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1]
}

type EnvTarget = { label: string; ref?: string; token?: string }

function resolveEnv(label: string, file: string, refVar: string, tokenVar: string): EnvTarget {
  const fileEnv = loadEnvFile(file)
  return {
    label,
    ref:   process.env[refVar]   ?? fileEnv.PROJECT_REF ?? projectRefFromUrl(fileEnv.NEXT_PUBLIC_SUPABASE_URL),
    token: process.env[tokenVar] ?? fileEnv.SUPABASE_ACCESS_TOKEN,
  }
}

const STG  = resolveEnv('STG',  '.env.staging',    'STG_PROJECT_REF',  'STG_SUPABASE_ACCESS_TOKEN')
const PROD = resolveEnv('PROD', '.env.local.prod', 'PROD_PROJECT_REF', 'PROD_SUPABASE_ACCESS_TOKEN')

// ── Triggers y políticas RLS — chequeo de existencia (schema-engine.ts no los cubre) ──

export type NamedObject = { table: string; name: string }

export function diffExistence(stg: NamedObject[], prod: NamedObject[]): { onlyStg: NamedObject[]; onlyProd: NamedObject[] } {
  const key = (o: NamedObject) => `${o.table}|${o.name}`
  const stgKeys  = new Set(stg.map(key))
  const prodKeys = new Set(prod.map(key))
  return {
    onlyStg:  stg.filter(o  => !prodKeys.has(key(o))),
    onlyProd: prod.filter(o => !stgKeys.has(key(o))),
  }
}

async function fetchTriggers(config: SqlConfig): Promise<NamedObject[]> {
  const rows = await executeSql(`
    SELECT DISTINCT event_object_table AS table_name, trigger_name
    FROM information_schema.triggers
    WHERE trigger_schema = 'public'
  `, config)
  return rows.map(r => ({ table: String(r.table_name), name: String(r.trigger_name) }))
}

async function fetchPolicies(config: SqlConfig): Promise<NamedObject[]> {
  const rows = await executeSql(`
    SELECT tablename AS table_name, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
  `, config)
  return rows.map(r => ({ table: String(r.table_name), name: String(r.policyname) }))
}

// ── Formato de salida ────────────────────────────────────────────────────

function describeFinding(f: SchemaFinding): string {
  // expected=STG, actual=PROD: DRIFT = "de más en PROD", MISSING = "falta en PROD"
  if (f.type === 'DRIFT')   return `[SOLO EN PROD]   ${f.objectType} ${f.objectName} — ${f.detail}`
  if (f.type === 'MISSING') return `[SOLO EN STG]    ${f.objectType} ${f.objectName} — ${f.detail}`
  return `[DISTINTO]       ${f.objectType} ${f.objectName} — ${f.detail}`
}

// ── Main ──────────────────────────────────────────────────────────────────

async function main() {
  const today = new Date().toISOString().slice(0, 10)
  console.log(`\n════════════════════════════════════════════════════════════`)
  console.log(`  VERIFICAR ESQUEMA — STG vs PROD — ${today}`)
  console.log(`════════════════════════════════════════════════════════════\n`)

  const stgReady  = Boolean(STG.ref && STG.token)
  const prodReady = Boolean(PROD.ref && PROD.token)
  if (!stgReady || !prodReady) {
    console.error(`Faltan credenciales — STG ready=${stgReady} PROD ready=${prodReady}.`)
    console.error('Este script no tiene modo parcial: sin los dos ambientes no hay esquema que comparar.')
    process.exit(1)
  }

  const stgConfig:  SqlConfig = { projectRef: STG.ref!,  token: STG.token! }
  const prodConfig: SqlConfig = { projectRef: PROD.ref!, token: PROD.token! }

  console.log('Extrayendo esquema de STG y PROD (tablas, columnas, constraints, índices, funciones, triggers, políticas)...\n')
  const [stgSchema, prodSchema, stgTriggers, prodTriggers, stgPolicies, prodPolicies] = await Promise.all([
    fetchSchemaState(stgConfig),
    fetchSchemaState(prodConfig),
    fetchTriggers(stgConfig),
    fetchTriggers(prodConfig),
    fetchPolicies(stgConfig),
    fetchPolicies(prodConfig),
  ])

  // STG = "expected" (doctrina: se migra primero), PROD = "actual".
  // Modo 'post-apply': cualquier ausencia es ERROR, no INFO — acá no hay
  // "todavía no se aplicó", los dos ambientes deberían estar al día.
  const findings = evaluateSchemaDiff(stgSchema, prodSchema, 'post-apply')

  console.log('── Columnas, funciones, constraints e índices (vía schema-engine) ──\n')
  if (findings.length === 0) {
    console.log('   Ninguna divergencia.')
  } else {
    for (const f of findings) console.log('   ' + describeFinding(f))
  }

  const triggerDiff = diffExistence(stgTriggers, prodTriggers)
  console.log('\n── Triggers ─────────────────────────────────────────────────\n')
  if (triggerDiff.onlyStg.length === 0 && triggerDiff.onlyProd.length === 0) {
    console.log('   Ninguna divergencia.')
  } else {
    for (const t of triggerDiff.onlyStg)  console.log(`   [SOLO EN STG]    trigger ${t.table}.${t.name}`)
    for (const t of triggerDiff.onlyProd) console.log(`   [SOLO EN PROD]   trigger ${t.table}.${t.name}`)
  }

  const policyDiff = diffExistence(stgPolicies, prodPolicies)
  console.log('\n── Políticas RLS ────────────────────────────────────────────\n')
  if (policyDiff.onlyStg.length === 0 && policyDiff.onlyProd.length === 0) {
    console.log('   Ninguna divergencia.')
  } else {
    for (const p of policyDiff.onlyStg)  console.log(`   [SOLO EN STG]    policy ${p.table}.${p.name}`)
    for (const p of policyDiff.onlyProd) console.log(`   [SOLO EN PROD]   policy ${p.table}.${p.name}`)
  }

  const totalDivergent = findings.length + triggerDiff.onlyStg.length + triggerDiff.onlyProd.length
    + policyDiff.onlyStg.length + policyDiff.onlyProd.length

  console.log('\n── Resumen ──────────────────────────────────────────────────\n')
  if (totalDivergent > 0) {
    console.log(`   DIVERGENCIA DE ESQUEMA: ${totalDivergent} diferencia(s) entre STG y PROD.`)
    console.log('   Exit code 1.')
    process.exit(1)
  }
  console.log('   Esquema idéntico entre STG y PROD.')
  console.log('   Exit code 0.')
}

// Auto-run solo si se ejecuta directamente via CLI -- importar este modulo
// (p. ej. para testear diffExistence) no debe disparar llamadas de red.
if (typeof require !== 'undefined' && require.main === module) {
  main().catch(e => { console.error('Fatal:', e); process.exit(1) })
}
