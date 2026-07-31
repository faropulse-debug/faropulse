/**
 * Estado real — Capa 5 del arsenal de diagnóstico.
 * SOLO LECTURA. No hace push, no aplica migraciones, no escribe en ninguna DB.
 * Solo corre `git log/diff/cherry` (lectura de objetos) y SELECTs de metadata
 * (information_schema / pg_catalog / pg_proc) vía Management API.
 *
 * Regla anti-fantasma: la memoria y las notas envejecen. Este script nunca lee
 * notas — solo la fuente viva (git remoto + los catálogos reales de Supabase).
 * Correlo antes de CADA decisión de despliegue, no confíes en la última corrida.
 *
 * Responde:
 *   1) De los commits en develop y no en main, ¿cuáles ya están en main POR
 *      CONTENIDO (el archivo que tocaban ya es idéntico entre las dos ramas hoy)
 *      vs cuáles tocan un archivo que todavía difiere de verdad?
 *   2) Foto de divergencia real de archivos main vs develop, agrupada por área.
 *   3) Estado de migraciones del repo en STG y PROD, inferido contra los
 *      catálogos reales (tablas/columnas/funciones/índices que cada migración
 *      declara), porque PROD no tiene tabla de tracking de migraciones.
 *   4) Un resumen fechado en una línea.
 *
 * Uso:
 *   npx tsx scripts/estado-real.ts
 *
 * Config (todo opcional — si falta algo, esa sección se saltea con aviso):
 *   - Git: usa `origin/main` y `origin/develop`. Hace `git fetch` antes (solo
 *     lectura de refs, no toca el working tree ni las ramas locales).
 *   - STG:  lee PROJECT_REF (o lo deriva de NEXT_PUBLIC_SUPABASE_URL) y
 *           SUPABASE_ACCESS_TOKEN desde .env.staging
 *   - PROD: lee PROJECT_REF (o lo deriva de NEXT_PUBLIC_SUPABASE_URL) y
 *           SUPABASE_ACCESS_TOKEN desde .env.local.prod
 *   Override manual: STG_PROJECT_REF / STG_SUPABASE_ACCESS_TOKEN /
 *                     PROD_PROJECT_REF / PROD_SUPABASE_ACCESS_TOKEN
 */

import { execFileSync } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'

const MAIN_REF    = 'origin/main'
const DEVELOP_REF = 'origin/develop'

// ── Env loading ──────────────────────────────────────────────────────────────

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

function resolveEnv(label: string, file: string, refOverrideVar: string, tokenOverrideVar: string): EnvTarget {
  const fileEnv = loadEnvFile(file)
  return {
    label,
    ref:   process.env[refOverrideVar]   ?? fileEnv.PROJECT_REF ?? projectRefFromUrl(fileEnv.NEXT_PUBLIC_SUPABASE_URL),
    token: process.env[tokenOverrideVar] ?? fileEnv.SUPABASE_ACCESS_TOKEN,
  }
}

const STG  = resolveEnv('STG',  '.env.staging',    'STG_PROJECT_REF',  'STG_SUPABASE_ACCESS_TOKEN')
const PROD = resolveEnv('PROD', '.env.local.prod', 'PROD_PROJECT_REF', 'PROD_SUPABASE_ACCESS_TOKEN')

// ── Git helpers (solo lectura: log/diff/cherry/ls-tree/show) ────────────────

function git(args: string[]): string {
  return execFileSync('git', args, { encoding: 'utf8' }).trim()
}

function fetchRefs() {
  execFileSync('git', ['fetch', 'origin', 'main', 'develop', '--quiet'])
}

function area(filePath: string): string {
  if (filePath.startsWith('supabase/migrations/')) return 'migraciones'
  if (filePath.startsWith('tests/'))                return 'tests'
  if (filePath === 'proxy.ts' || filePath === 'middleware.ts' || filePath === 'lib/api-auth.ts' ||
      filePath.startsWith('app/login/') || filePath.startsWith('app/role-select/') ||
      filePath.startsWith('providers/AuthProvider') || /useAuth/i.test(filePath)) return 'auth'
  if (filePath.startsWith('app/api/upload/') || filePath.startsWith('src/lib/upload/') ||
      filePath.startsWith('app/dashboard/upload/')) return 'upload'
  if (filePath.startsWith('app/dashboard/')) return 'dashboard'
  return 'otros'
}

// ── Parte 1+2: reconciliación de commits + divergencia real de archivos ─────

type CommitInfo = { sha: string; subject: string; files: string[] }

function parseLogWithFiles(range: string): CommitInfo[] {
  // Un solo `git log --name-only` en vez de N `git show` — mucho más rápido para ~100 commits.
  const raw = git(['log', range, '--name-only', '--format=%x01%H%x02%s'])
  if (!raw) return []
  const commits: CommitInfo[] = []
  const blocks = raw.split('\x01').filter(Boolean)
  for (const block of blocks) {
    const sepIdx = block.indexOf('\x02')
    const sha = block.slice(0, sepIdx)
    const rest = block.slice(sepIdx + 1)
    const lines = rest.split('\n')
    const subject = lines[0]
    const files = lines.slice(1).filter(l => l.trim().length > 0)
    commits.push({ sha, subject, files })
  }
  return commits
}

function runGitAnalysis() {
  fetchRefs()

  const devAheadCount  = parseInt(git(['rev-list', '--count', `${MAIN_REF}..${DEVELOP_REF}`]), 10)
  const mainAheadCount = parseInt(git(['rev-list', '--count', `${DEVELOP_REF}..${MAIN_REF}`]), 10)

  const devOnlyCommits  = parseLogWithFiles(`${MAIN_REF}..${DEVELOP_REF}`)
  const mainOnlyCommits = parseLogWithFiles(`${DEVELOP_REF}..${MAIN_REF}`)

  // Divergencia real de archivos: diff de contenido HOY entre las dos ramas, no historial.
  const nameStatusRaw = git(['diff', '--name-status', MAIN_REF, DEVELOP_REF])
  const fileDiffs = nameStatusRaw.split('\n').filter(Boolean).map(line => {
    const parts = line.split('\t')
    const status = parts[0]
    const file = parts[parts.length - 1]
    return { status, file }
  })
  const divergentFiles = new Set(fileDiffs.map(d => d.file))

  // Para cada commit único de develop: ¿alguno de los archivos que toca sigue
  // divergiendo hoy? Si NINGUNO diverge, el contenido de ese commit ya está en
  // main (llegó por squash u otro merge) — no es trabajo pendiente real.
  const pending: CommitInfo[] = []
  const landedByContent: CommitInfo[] = []
  for (const c of devOnlyCommits) {
    const touchesDivergent = c.files.some(f => divergentFiles.has(f))
    if (touchesDivergent) pending.push({ ...c, files: c.files.filter(f => divergentFiles.has(f)) })
    else landedByContent.push(c)
  }

  // Cross-check con git cherry (equivalencia de patch-id) — detecta cherry-picks
  // directos que git-name-only-diff no distingue tan bien; complementario, no autoritativo.
  let cherryMinus = 0, cherryPlus = 0
  try {
    const cherryRaw = git(['cherry', MAIN_REF, DEVELOP_REF]).split('\n').filter(Boolean)
    cherryMinus = cherryRaw.filter(l => l.startsWith('-')).length
    cherryPlus  = cherryRaw.filter(l => l.startsWith('+')).length
  } catch {
    // git cherry puede ser lento/fallar en historiales muy divergentes — no bloquea el resto.
  }

  const filesByArea = new Map<string, { status: string; file: string }[]>()
  for (const d of fileDiffs) {
    const a = area(d.file)
    if (!filesByArea.has(a)) filesByArea.set(a, [])
    filesByArea.get(a)!.push(d)
  }

  return {
    devAheadCount, mainAheadCount,
    devOnlyCommits, mainOnlyCommits,
    pending, landedByContent,
    cherryMinus, cherryPlus,
    fileDiffs, filesByArea,
  }
}

// ── Parte 3: estado de migraciones por ambiente ──────────────────────────────

type Marker =
  | { kind: 'table';    name: string }
  | { kind: 'function'; name: string }
  | { kind: 'index';    name: string; table: string }
  | { kind: 'column';   table: string; name: string }

// Políticas RLS y constraints son DDL de seguridad/integridad — relevantes,
// pero su verificación ya vive en scripts/audit-rls.ts (policies) y no se
// duplica acá. Se etiquetan aparte para que "no-verificable" no se confunda
// con "sin ningún marcador" (p.ej. una migración puramente de datos).
type UnverifiedMarker = { kind: 'policy' | 'constraint'; name: string }

type MigrationInfo = { file: string; version: string; markers: Marker[]; unverified: UnverifiedMarker[] }

function extractMarkers(sql: string): { markers: Marker[]; unverified: UnverifiedMarker[]; droppedIndexes: string[] } {
  const markers: Marker[] = []
  const unverified: UnverifiedMarker[] = []
  const droppedIndexes: string[] = []
  const clean = sql.replace(/--.*$/gm, '') // fuera comentarios de línea, evita falsos positivos

  for (const m of clean.matchAll(/CREATE\s+TABLE\s+(?:IF NOT EXISTS\s+)?(?:public\.)?"?(\w+)"?/gi))
    markers.push({ kind: 'table', name: m[1] })

  for (const m of clean.matchAll(/CREATE\s+(?:OR REPLACE\s+)?FUNCTION\s+(?:public\.)?"?(\w+)"?\s*\(/gi))
    markers.push({ kind: 'function', name: m[1] })

  for (const m of clean.matchAll(/CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:CONCURRENTLY\s+)?(?:IF NOT EXISTS\s+)?"?(\w+)"?\s+ON\s+(?:public\.)?"?(\w+)"?/gi))
    markers.push({ kind: 'index', name: m[1], table: m[2] })

  for (const m of clean.matchAll(/ALTER\s+TABLE\s+(?:public\.)?"?(\w+)"?\s+ADD\s+COLUMN\s+(?:IF NOT EXISTS\s+)?"?(\w+)"?/gi))
    markers.push({ kind: 'column', table: m[1], name: m[2] })

  for (const m of clean.matchAll(/CREATE\s+POLICY\s+"?(\w+)"?\s+ON/gi))
    unverified.push({ kind: 'policy', name: m[1] })

  for (const m of clean.matchAll(/ADD\s+CONSTRAINT\s+"?(\w+)"?/gi))
    unverified.push({ kind: 'constraint', name: m[1] })

  // Un índice creado por una migración anterior puede ser DROPeado y
  // reemplazado por una migración posterior (p.ej. "promote a UNIQUE").
  // Si no se descuenta, el índice viejo queda marcado "FALTA" para siempre
  // aunque el reemplazo exista — falso positivo. Se resta más abajo.
  for (const m of clean.matchAll(/DROP\s+INDEX\s+(?:IF EXISTS\s+)?(?:CONCURRENTLY\s+)?(?:public\.)?"?(\w+)"?/gi))
    droppedIndexes.push(m[1])

  return { markers, unverified, droppedIndexes }
}

function loadMigrations(ref: string): MigrationInfo[] {
  const files = git(['ls-tree', '-r', '--name-only', ref, '--', 'supabase/migrations/'])
    .split('\n').filter(f => f.endsWith('.sql'))
    .sort() // orden cronológico — el timestamp del filename es el prefijo

  const perFile = files.map(file => {
    const sql = git(['show', `${ref}:${file}`])
    const version = path.basename(file).split('_')[0]
    const { markers, unverified, droppedIndexes } = extractMarkers(sql)
    return { file: path.basename(file), version, markers, unverified, droppedIndexes }
  })

  // Un índice dropeado por CUALQUIER migración del set (sin importar el orden
  // de archivo) ya no es un requisito vigente — se remueve de todos los
  // markers que lo pedían, sea cual sea la migración que originalmente lo creó.
  const allDropped = new Set(perFile.flatMap(m => m.droppedIndexes))

  return perFile.map(({ file, version, markers, unverified }) => ({
    file, version, unverified,
    markers: markers.filter(mk => !(mk.kind === 'index' && allDropped.has(mk.name))),
  }))
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

const sqlArrayLiteral = (values: string[]) =>
  `ARRAY[${values.map(v => `'${v.replace(/'/g, "''")}'`).join(',')}]`

async function checkMigrationsAgainstEnv(env: EnvTarget, migrations: MigrationInfo[]) {
  if (!env.ref || !env.token) {
    return { env: env.label, skipped: true as const, reason: 'Falta PROJECT_REF o SUPABASE_ACCESS_TOKEN' }
  }

  // 1) ¿Existe tabla de tracking de la CLI de Supabase?
  const trackingRows = await sqlQuery(env.ref, env.token, `
    SELECT EXISTS (
      SELECT 1 FROM information_schema.schemata WHERE schema_name = 'supabase_migrations'
    ) AS has_schema
  `)
  const hasTrackingSchema = Boolean(trackingRows[0]?.has_schema)

  let trackedVersions = new Set<string>()
  if (hasTrackingSchema) {
    try {
      const rows = await sqlQuery(env.ref, env.token, `SELECT version FROM supabase_migrations.schema_migrations`)
      trackedVersions = new Set(rows.map(r => String(r.version)))
    } catch {
      // La tabla puede no existir aunque el schema sí (proyecto nunca usó `supabase db push`).
    }
  }

  // 2) Existencia real de objetos (fuente de verdad cuando no hay tracking, y
  //    chequeo cruzado cuando sí lo hay).
  const tableNames    = [...new Set(migrations.flatMap(m => m.markers.filter(x => x.kind === 'table').map(x => (x as any).name)))]
  const funcNames     = [...new Set(migrations.flatMap(m => m.markers.filter(x => x.kind === 'function').map(x => (x as any).name)))]
  const indexNames    = [...new Set(migrations.flatMap(m => m.markers.filter(x => x.kind === 'index').map(x => (x as any).name)))]
  const columnMarkers = migrations.flatMap(m => m.markers.filter(x => x.kind === 'column')) as { kind: 'column'; table: string; name: string }[]
  const columnTables  = [...new Set(columnMarkers.map(c => c.table))]

  const [tableRows, funcRows, indexRows, columnRows] = await Promise.all([
    tableNames.length
      ? sqlQuery(env.ref, env.token, `SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name = ANY(${sqlArrayLiteral(tableNames)})`)
      : Promise.resolve([]),
    funcNames.length
      ? sqlQuery(env.ref, env.token, `SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname='public' AND p.proname = ANY(${sqlArrayLiteral(funcNames)})`)
      : Promise.resolve([]),
    indexNames.length
      ? sqlQuery(env.ref, env.token, `SELECT indexname FROM pg_indexes WHERE schemaname='public' AND indexname = ANY(${sqlArrayLiteral(indexNames)})`)
      : Promise.resolve([]),
    columnTables.length
      ? sqlQuery(env.ref, env.token, `SELECT table_name, column_name FROM information_schema.columns WHERE table_schema='public' AND table_name = ANY(${sqlArrayLiteral(columnTables)})`)
      : Promise.resolve([]),
  ])

  const existingTables  = new Set(tableRows.map(r => String(r.table_name)))
  const existingFuncs   = new Set(funcRows.map(r => String(r.proname)))
  const existingIndexes = new Set(indexRows.map(r => String(r.indexname)))
  const existingColumns = new Set(columnRows.map(r => `${r.table_name}.${r.column_name}`))

  function markerPresent(mk: Marker): boolean {
    if (mk.kind === 'table')    return existingTables.has(mk.name)
    if (mk.kind === 'function') return existingFuncs.has(mk.name)
    if (mk.kind === 'index')    return existingIndexes.has(mk.name)
    if (mk.kind === 'column')   return existingColumns.has(`${mk.table}.${mk.name}`)
    return false
  }

  const results = migrations.map(m => {
    const trackedInSchema = hasTrackingSchema ? trackedVersions.has(m.version) : null
    const hasPolicyOrConstraint = m.unverified.length > 0
    if (m.markers.length === 0) {
      const kinds = [...new Set(m.unverified.map(u => u.kind))].join('+')
      const detail = hasPolicyOrConstraint
        ? `contiene ${kinds} (${m.unverified.map(u => u.name).join(', ')}) — no cubierto acá, ver scripts/audit-rls.ts para policies`
        : 'sin marcador de objeto extraíble (revisar manualmente)'
      return { file: m.file, version: m.version, verdict: 'no-verificable' as const, trackedInSchema, detail }
    }
    const allPresent = m.markers.every(markerPresent)
    const somePresent = m.markers.some(markerPresent)
    const verdict = allPresent ? 'aplicada' as const : somePresent ? 'parcial' as const : 'no-aplicada' as const
    return { file: m.file, version: m.version, verdict, trackedInSchema, markers: m.markers }
  })

  return { env: env.label, skipped: false as const, hasTrackingSchema, results }
}

// ── Main ──────────────────────────────────────────────────────────────────

async function main() {
  const today = new Date().toISOString().slice(0, 10)
  console.log(`\n════════════════════════════════════════════════════════════`)
  console.log(`  ESTADO REAL — ${today}`)
  console.log(`  fuente: git origin (fetch en vivo) + Management API`)
  console.log(`════════════════════════════════════════════════════════════\n`)

  // ── 1+2: git ──────────────────────────────────────────────────────────────
  console.log('── (1) Reconciliación de commits develop vs main ─────────────\n')
  const g = runGitAnalysis()

  console.log(`   git dice: develop tiene ${g.devAheadCount} commits que main no tiene.`)
  console.log(`   git dice: main tiene ${g.mainAheadCount} commit(s) que develop no tiene.`)
  console.log(`   git cherry (equivalencia de patch-id): ${g.cherryMinus} ya equivalentes en main, ${g.cherryPlus} sin equivalente directo.`)
  console.log('')
  console.log(`   De esos ${g.devAheadCount} commits de develop, por CONTENIDO real (¿el archivo que tocan sigue diferente hoy?):`)
  console.log(`     - Ya en main por contenido (ningún archivo que tocan sigue divergiendo): ${g.landedByContent.length}`)
  console.log(`     - Pendientes reales (tocan ≥1 archivo que hoy todavía difiere):          ${g.pending.length}`)

  if (g.mainOnlyCommits.length > 0) {
    console.log(`\n   Commit(s) en main que develop no tiene:`)
    for (const c of g.mainOnlyCommits) console.log(`     - ${c.sha.slice(0, 7)} ${c.subject}`)
  }

  console.log('\n── (2) Divergencia real de archivos (main vs develop, HOY) ───\n')
  console.log(`   Total de archivos que difieren de verdad: ${g.fileDiffs.length}\n`)
  for (const [a, files] of [...g.filesByArea.entries()].sort((x, y) => y[1].length - x[1].length)) {
    console.log(`   ${a}: ${files.length} archivo(s)`)
    for (const f of files) console.log(`     [${f.status}] ${f.file}`)
  }

  // ── 3: migraciones ───────────────────────────────────────────────────────
  console.log('\n── (3) Estado de migraciones por ambiente ─────────────────────\n')
  const migrationsOnDevelop = loadMigrations(DEVELOP_REF)
  console.log(`   Migraciones en el repo (origin/develop): ${migrationsOnDevelop.length}\n`)

  const [stgReport, prodReport] = await Promise.all([
    checkMigrationsAgainstEnv(STG, migrationsOnDevelop),
    checkMigrationsAgainstEnv(PROD, migrationsOnDevelop),
  ])

  let stgMissing = 0, prodMissing = 0

  for (const report of [stgReport, prodReport]) {
    console.log(`   ${report.env}:`)
    if (report.skipped) {
      console.log(`     saltado — ${report.reason}\n`)
      continue
    }
    console.log(`     tabla de tracking supabase_migrations.schema_migrations: ${report.hasTrackingSchema ? 'existe' : 'NO existe (inferencia por objetos)'}`)
    const notApplied = report.results.filter(r => r.verdict === 'no-aplicada')
    const partial     = report.results.filter(r => r.verdict === 'parcial')
    const unverifiable = report.results.filter(r => r.verdict === 'no-verificable')
    const applied      = report.results.filter(r => r.verdict === 'aplicada')
    console.log(`     aplicadas: ${applied.length} | parciales: ${partial.length} | no-aplicadas: ${notApplied.length} | no-verificables: ${unverifiable.length} (de ${report.results.length})`)
    if (notApplied.length > 0) {
      console.log(`     NO aplicadas:`)
      for (const r of notApplied) console.log(`       - ${r.file}`)
    }
    if (partial.length > 0) {
      console.log(`     PARCIALES (revisar — puede ser migración parcialmente aplicada o marcador ambiguo):`)
      for (const r of partial) console.log(`       - ${r.file}`)
    }
    if (unverifiable.length > 0) {
      console.log(`     no-verificables (detalle):`)
      for (const r of unverifiable) console.log(`       - ${r.file}: ${(r as any).detail}`)
    }
    if (report.env === 'STG') stgMissing = notApplied.length + partial.length
    if (report.env === 'PROD') prodMissing = notApplied.length + partial.length
    console.log('')
  }

  // ── 4: resumen ────────────────────────────────────────────────────────────
  console.log('── (4) Resumen ─────────────────────────────────────────────────\n')
  const prodLine = prodReport.skipped ? 'PROD: no verificado (faltan credenciales)' : `PROD difiere del repo (develop) en ${prodMissing} migración(es) no confirmada(s)`
  const stgLine  = stgReport.skipped  ? 'STG: no verificado (faltan credenciales)'  : `STG difiere del repo (develop) en ${stgMissing} migración(es) no confirmada(s)`

  console.log(`   Al ${today}:`)
  console.log(`   - main tiene ${g.mainAheadCount} commit(s) que develop no tiene.`)
  console.log(`   - develop tiene ${g.devAheadCount} commits reportados por git, de los cuales ${g.pending.length} son pendientes REALES (contenido no presente en main) y ${g.landedByContent.length} ya están en main por contenido.`)
  console.log(`   - ${g.fileDiffs.length} archivo(s) difieren de verdad entre main y develop hoy.`)
  console.log(`   - ${stgLine}.`)
  console.log(`   - ${prodLine}.`)
  console.log('')
}

main().catch(e => { console.error('Fatal:', e); process.exit(1) })
