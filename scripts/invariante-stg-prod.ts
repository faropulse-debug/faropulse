/**
 * Invariante STG vs PROD — Capa 6 del arsenal de diagnóstico.
 * SOLO LECTURA en los dos ambientes. PROD nunca se escribe, bajo ninguna
 * circunstancia — este script ni siquiera importa un cliente con permiso de
 * escritura.
 *
 * Origen: el 2026-08-30, Tano detectó a mano (dos queries SQL, una por
 * ambiente) que 3 documentos con descuento=100 en STG no tenían filas en
 * sales_items aunque los mismos 3 sí las tenían en PROD — un hueco de
 * ingesta de $89.700 en la suma de bruto derivado. Cada verificación manual
 * que se repite se convierte en script: este es ese script.
 *
 * 2026-09 — punto ciego encontrado y cerrado: la primera versión de este
 * script solo comparaba presencia/ausencia de items (0 vs >0). Corrido
 * después de que Tano recargó los Excel de junio, dio "sin divergencias"
 * con sales_items en 89.723 (STG) vs 89.726 (PROD) — 3 filas de diferencia
 * real que el criterio de presencia no ve porque ambos lados tenían items,
 * solo que en cantidad distinta para al menos un documento. Mismo tipo de
 * agujero que NULL vs cero: un verde que no verifica todo es tan engañoso
 * como un rojo permanente. Ver (3) más abajo.
 *
 * Qué compara, por tabla (sales_documents, sales_items), para la location
 * configurada en cada ambiente:
 *   1) Conteo de filas. (2) Rango de fechas (MIN/MAX fecha_caja).
 *   3) Documentos cuya clave de negocio (external_id, fecha_caja) existe en
 *      los dos ambientes, pero tiene items en uno y no en el otro.
 *   4) Documentos con items en los dos ambientes, pero con una CANTIDAD de
 *      items distinta entre STG y PROD (el punto ciego cerrado en 2026-09).
 *
 * NOTA sobre exit code (mismo criterio que scripts/check-dependency-audit.mjs
 * — un check que siempre da rojo por diferencias esperadas no informa nada):
 *   - (1) y (2) son informativos. STG y PROD divergen en volumen total por
 *     diseño (sync periódico, no espejo en vivo) — no son señal de bug por
 *     sí solos, así que NO determinan el exit code.
 *   - (3) y (4) sí lo determinan: cualquiera de los dos es evidencia de que
 *     el mismo documento de negocio tiene datos de items distintos entre
 *     ambientes — exactamente el patrón del incidente de origen, con o sin
 *     presencia total. Exit code 1 si aparece al menos un caso de (3) o (4).
 *   - Si PROD no tiene credenciales configuradas, el script no falla: hace
 *     lo que puede solo-STG y lo marca explícitamente como chequeo parcial.
 *
 * Uso:
 *   npx tsx scripts/invariante-stg-prod.ts
 *
 * Config (mismo patrón que scripts/estado-real.ts):
 *   - STG:  PROJECT_REF (o derivado de NEXT_PUBLIC_SUPABASE_URL) y
 *           SUPABASE_ACCESS_TOKEN desde .env.staging
 *   - PROD: ídem desde .env.local.prod
 *   Override manual: STG_PROJECT_REF / STG_SUPABASE_ACCESS_TOKEN /
 *                     PROD_PROJECT_REF / PROD_SUPABASE_ACCESS_TOKEN
 *   Location por ambiente: NEXT_PUBLIC_LOCATION_ID del mismo archivo, o
 *                     override STG_LOCATION_ID / PROD_LOCATION_ID.
 */

import * as fs from 'fs'
import * as path from 'path'

// ── Env loading (idéntico a scripts/estado-real.ts) ─────────────────────────

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

type EnvTarget = { label: string; ref?: string; token?: string; locationId?: string }

function resolveEnv(
  label: string, file: string,
  refVar: string, tokenVar: string, locationVar: string,
): EnvTarget {
  const fileEnv = loadEnvFile(file)
  return {
    label,
    ref:        process.env[refVar]      ?? fileEnv.PROJECT_REF ?? projectRefFromUrl(fileEnv.NEXT_PUBLIC_SUPABASE_URL),
    token:      process.env[tokenVar]    ?? fileEnv.SUPABASE_ACCESS_TOKEN,
    locationId: process.env[locationVar] ?? fileEnv.NEXT_PUBLIC_LOCATION_ID,
  }
}

const STG  = resolveEnv('STG',  '.env.staging',    'STG_PROJECT_REF',  'STG_SUPABASE_ACCESS_TOKEN',  'STG_LOCATION_ID')
const PROD = resolveEnv('PROD', '.env.local.prod', 'PROD_PROJECT_REF', 'PROD_SUPABASE_ACCESS_TOKEN', 'PROD_LOCATION_ID')

// ── SQL vía Management API (solo SELECT — nunca INSERT/UPDATE/DELETE) ──────

async function sqlQuery(ref: string, token: string, query: string): Promise<Record<string, unknown>[]> {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({ query }),
  })
  if (!res.ok) throw new Error(`SQL error ${res.status}: ${await res.text()}`)
  return res.json() as Promise<Record<string, unknown>[]>
}

const TABLES = ['sales_documents', 'sales_items'] as const

type RowCountReport = { table: string; n: number; desde: string | null; hasta: string | null }
type DocKey = { external_id: string; fecha_caja: string; item_count: number }

async function rowCounts(env: EnvTarget): Promise<RowCountReport[]> {
  const reports: RowCountReport[] = []
  for (const table of TABLES) {
    const rows = await sqlQuery(env.ref!, env.token!, `
      SELECT COUNT(*) AS n, MIN(fecha_caja) AS desde, MAX(fecha_caja) AS hasta
      FROM ${table}
      WHERE location_id = '${env.locationId}'
    `)
    const r = rows[0]
    reports.push({
      table,
      n: Number(r.n),
      desde: r.desde ? String(r.desde) : null,
      hasta: r.hasta ? String(r.hasta) : null,
    })
  }
  return reports
}

// Clave de negocio: (external_id, fecha_caja). NO se usa location_id para
// matchear entre ambientes — STG y PROD tienen location_id distintos para
// la misma location de negocio.
//
// item_count (no un booleano has_items): un LEFT JOIN + COUNT trae la
// cantidad real de filas de sales_items por documento, no solo si hay
// alguna. Es lo que permite detectar (4) — mismo documento, items en los
// dos lados, pero cantidad distinta — que un EXISTS booleano no puede ver.
async function fetchDocKeys(env: EnvTarget): Promise<DocKey[]> {
  const rows = await sqlQuery(env.ref!, env.token!, `
    SELECT
      d.external_id,
      d.fecha_caja::text AS fecha_caja,
      COUNT(si.id)        AS item_count
    FROM sales_documents d
    LEFT JOIN sales_items si
      ON si.location_id   = d.location_id
     AND si.numero_ticket  = d.external_id
     AND si.fecha_caja     = d.fecha_caja
    WHERE d.location_id = '${env.locationId}'
      AND d.external_id IS NOT NULL
      AND d.fecha_caja IS NOT NULL
    GROUP BY d.external_id, d.fecha_caja
  `)
  return rows.map(r => ({
    external_id: String(r.external_id),
    fecha_caja: String(r.fecha_caja),
    item_count: Number(r.item_count),
  }))
}

type ItemsDivergence = { external_id: string; fecha_caja: string; stg_has_items: boolean; prod_has_items: boolean }
type CountDivergence = { external_id: string; fecha_caja: string; stg_count: number; prod_count: number; delta: number }

function diffItems(stgKeys: DocKey[], prodKeys: DocKey[]): { presence: ItemsDivergence[]; count: CountDivergence[] } {
  const prodByKey = new Map(prodKeys.map(k => [`${k.external_id}|${k.fecha_caja}`, k]))
  const presence: ItemsDivergence[] = []
  const count: CountDivergence[] = []

  for (const s of stgKeys) {
    const p = prodByKey.get(`${s.external_id}|${s.fecha_caja}`)
    if (!p) continue // el documento no existe en el otro ambiente — no es un hueco de items, es otra cosa

    const sHas = s.item_count > 0
    const pHas = p.item_count > 0

    if (sHas !== pHas) {
      // (3) presencia: uno tiene items, el otro no.
      presence.push({ external_id: s.external_id, fecha_caja: s.fecha_caja, stg_has_items: sHas, prod_has_items: pHas })
    } else if (sHas && pHas && s.item_count !== p.item_count) {
      // (4) cantidad: los dos tienen items, pero no la misma cantidad.
      count.push({
        external_id: s.external_id, fecha_caja: s.fecha_caja,
        stg_count: s.item_count, prod_count: p.item_count,
        delta: p.item_count - s.item_count,
      })
    }
    // sHas === pHas === false (documento sin items en ningún lado) no es divergencia.
  }

  return { presence, count }
}

// ── Main ──────────────────────────────────────────────────────────────────

async function main() {
  const today = new Date().toISOString().slice(0, 10)
  console.log(`\n════════════════════════════════════════════════════════════`)
  console.log(`  INVARIANTE STG vs PROD — ${today}`)
  console.log(`════════════════════════════════════════════════════════════\n`)

  const stgReady  = Boolean(STG.ref && STG.token && STG.locationId)
  const prodReady = Boolean(PROD.ref && PROD.token && PROD.locationId)

  if (!stgReady) {
    console.error('STG: faltan credenciales o location (PROJECT_REF/SUPABASE_ACCESS_TOKEN/NEXT_PUBLIC_LOCATION_ID en .env.staging).')
    process.exit(1)
  }
  if (!prodReady) {
    console.log('PROD: saltado — faltan credenciales o location (.env.local.prod). Chequeo PARCIAL, solo STG.\n')
  }

  console.log('── (1) Conteo de filas y rango de fechas ──────────────────────\n')
  const stgCounts = await rowCounts(STG)
  for (const r of stgCounts) console.log(`   STG  ${r.table.padEnd(16)} n=${r.n}\tdesde=${r.desde ?? '—'}\thasta=${r.hasta ?? '—'}`)

  let prodCounts: RowCountReport[] = []
  if (prodReady) {
    prodCounts = await rowCounts(PROD)
    for (const r of prodCounts) console.log(`   PROD ${r.table.padEnd(16)} n=${r.n}\tdesde=${r.desde ?? '—'}\thasta=${r.hasta ?? '—'}`)
  }

  let presence: ItemsDivergence[] = []
  let count: CountDivergence[] = []

  if (prodReady) {
    console.log('\n── (2) Documentos con items en un ambiente y no en el otro ───\n')
    const [stgKeys, prodKeys] = await Promise.all([fetchDocKeys(STG), fetchDocKeys(PROD)])
    const diff = diffItems(stgKeys, prodKeys)
    presence = diff.presence
    count    = diff.count

    if (presence.length === 0) {
      console.log('   Ninguna. Todo documento presente en los dos ambientes tiene items en ambos, o en ninguno.')
    } else {
      console.log(`   ${presence.length} documento(s) con items en un ambiente y no en el otro:\n`)
      for (const d of presence.slice(0, 50)) {
        const falta = d.stg_has_items ? 'PROD' : 'STG'
        console.log(`     - ${d.external_id} (${d.fecha_caja}): falta en ${falta} (STG has_items=${d.stg_has_items}, PROD has_items=${d.prod_has_items})`)
      }
      if (presence.length > 50) console.log(`     ... y ${presence.length - 50} más`)
    }

    console.log('\n── (3) Documentos con distinta CANTIDAD de items (ambos ambientes tienen, pero no igual) ───\n')
    if (count.length === 0) {
      console.log('   Ninguna. Todo documento con items en los dos ambientes tiene la misma cantidad en ambos.')
    } else {
      let totalDelta = 0
      console.log(`   ${count.length} documento(s) con cantidad de items distinta:\n`)
      for (const d of count.slice(0, 50)) {
        totalDelta += d.delta
        console.log(`     - ${d.external_id} (${d.fecha_caja}): STG=${d.stg_count} PROD=${d.prod_count} (delta=${d.delta > 0 ? '+' : ''}${d.delta})`)
      }
      if (count.length > 50) {
        for (const d of count.slice(50)) totalDelta += d.delta
        console.log(`     ... y ${count.length - 50} más`)
      }
      console.log(`\n   Delta total de filas en estos documentos (PROD - STG): ${totalDelta > 0 ? '+' : ''}${totalDelta}`)
    }
  } else {
    console.log('\n── (2) Documentos con items en un ambiente y no en el otro ───\n')
    console.log('   Saltado — requiere credenciales de PROD.')
    console.log('\n── (3) Documentos con distinta CANTIDAD de items ──────────────\n')
    console.log('   Saltado — requiere credenciales de PROD.')
  }

  console.log('\n── Resumen ──────────────────────────────────────────────────\n')
  if (!prodReady) {
    console.log('   Chequeo PARCIAL: solo se verificó STG. No hay confirmación de paridad con PROD.')
    console.log('   Exit code 0 — no se declara divergencia sin haber podido comparar contra PROD.')
    process.exit(0)
  }

  // Delta total de filas en sales_items entre ambientes — no solo el de
  // documentos: el número de tabla completa (1), explícito acá para que no
  // dependa de que quien lee reste los dos números de (1) a mano.
  const stgItemsN  = stgCounts.find(r => r.table === 'sales_items')?.n  ?? 0
  const prodItemsN = prodCounts.find(r => r.table === 'sales_items')?.n ?? 0
  const totalRowDelta = prodItemsN - stgItemsN
  console.log(`   Delta total de filas en sales_items (PROD - STG): ${totalRowDelta > 0 ? '+' : ''}${totalRowDelta}`)

  const totalDivergent = presence.length + count.length
  if (totalDivergent > 0) {
    console.log(`   DIVERGENCIA: ${presence.length} documento(s) con presencia distinta + ${count.length} documento(s) con cantidad distinta.`)
    console.log('   Exit code 1.')
    process.exit(1)
  }

  console.log('   Sin divergencias de items entre STG y PROD (ni de presencia ni de cantidad).')
  console.log('   Exit code 0.')
}

main().catch(e => { console.error('Fatal:', e); process.exit(1) })
