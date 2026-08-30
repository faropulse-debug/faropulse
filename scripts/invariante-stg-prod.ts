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
 * Qué compara, por tabla (sales_documents, sales_items), para la location
 * configurada en cada ambiente:
 *   1) Conteo de filas.
 *   2) Rango de fechas (MIN/MAX fecha_caja).
 *   3) Documentos cuya clave de negocio (external_id, fecha_caja) existe en
 *      los dos ambientes, pero tiene items en uno y no en el otro.
 *
 * NOTA sobre exit code (mismo criterio que scripts/check-dependency-audit.mjs
 * — un check que siempre da rojo por diferencias esperadas no informa nada):
 *   - (1) y (2) son informativos. STG y PROD divergen en volumen total por
 *     diseño (sync periódico, no espejo en vivo) — no son señal de bug por
 *     sí solos, así que NO determinan el exit code.
 *   - (3) sí lo determina: un documento con la MISMA clave de negocio en los
 *     dos ambientes que tiene items en uno y no en el otro es exactamente el
 *     patrón del incidente de origen. Exit code 1 si aparece al menos uno.
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
type DocKey = { external_id: string; fecha_caja: string; has_items: boolean }

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
async function fetchDocKeys(env: EnvTarget): Promise<DocKey[]> {
  const rows = await sqlQuery(env.ref!, env.token!, `
    SELECT
      d.external_id,
      d.fecha_caja::text AS fecha_caja,
      EXISTS (
        SELECT 1 FROM sales_items si
        WHERE si.location_id  = d.location_id
          AND si.numero_ticket = d.external_id
          AND si.fecha_caja    = d.fecha_caja
      ) AS has_items
    FROM sales_documents d
    WHERE d.location_id = '${env.locationId}'
      AND d.external_id IS NOT NULL
      AND d.fecha_caja IS NOT NULL
  `)
  return rows.map(r => ({
    external_id: String(r.external_id),
    fecha_caja: String(r.fecha_caja),
    has_items: Boolean(r.has_items),
  }))
}

type ItemsDivergence = { external_id: string; fecha_caja: string; stg_has_items: boolean; prod_has_items: boolean }

function diffItemsPresence(stgKeys: DocKey[], prodKeys: DocKey[]): ItemsDivergence[] {
  const prodByKey = new Map(prodKeys.map(k => [`${k.external_id}|${k.fecha_caja}`, k]))
  const divergences: ItemsDivergence[] = []
  for (const s of stgKeys) {
    const p = prodByKey.get(`${s.external_id}|${s.fecha_caja}`)
    if (!p) continue // el documento no existe en el otro ambiente — no es un hueco de items, es otra cosa
    if (s.has_items !== p.has_items) {
      divergences.push({
        external_id: s.external_id, fecha_caja: s.fecha_caja,
        stg_has_items: s.has_items, prod_has_items: p.has_items,
      })
    }
  }
  return divergences
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

  let divergences: ItemsDivergence[] = []
  if (prodReady) {
    console.log('\n── (2) Documentos con items en un ambiente y no en el otro ───\n')
    const [stgKeys, prodKeys] = await Promise.all([fetchDocKeys(STG), fetchDocKeys(PROD)])
    divergences = diffItemsPresence(stgKeys, prodKeys)

    if (divergences.length === 0) {
      console.log('   Ninguna. Todo documento presente en los dos ambientes tiene items en ambos, o en ninguno.')
    } else {
      console.log(`   ${divergences.length} documento(s) con items en un ambiente y no en el otro:\n`)
      for (const d of divergences.slice(0, 50)) {
        const falta = d.stg_has_items ? 'PROD' : 'STG'
        console.log(`     - ${d.external_id} (${d.fecha_caja}): falta en ${falta} (STG has_items=${d.stg_has_items}, PROD has_items=${d.prod_has_items})`)
      }
      if (divergences.length > 50) console.log(`     ... y ${divergences.length - 50} más`)
    }
  } else {
    console.log('\n── (2) Documentos con items en un ambiente y no en el otro ───\n')
    console.log('   Saltado — requiere credenciales de PROD.')
  }

  console.log('\n── Resumen ──────────────────────────────────────────────────\n')
  if (!prodReady) {
    console.log('   Chequeo PARCIAL: solo se verificó STG. No hay confirmación de paridad con PROD.')
    console.log('   Exit code 0 — no se declara divergencia sin haber podido comparar contra PROD.')
    process.exit(0)
  }

  if (divergences.length > 0) {
    console.log(`   DIVERGENCIA: ${divergences.length} documento(s) con items en un ambiente y no en el otro.`)
    console.log('   Exit code 1.')
    process.exit(1)
  }

  console.log('   Sin divergencias de items entre STG y PROD.')
  console.log('   Exit code 0.')
}

main().catch(e => { console.error('Fatal:', e); process.exit(1) })
