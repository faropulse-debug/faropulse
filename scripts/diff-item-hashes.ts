/**
 * Diff de item_hash STG vs PROD — Capa 7 del arsenal de diagnóstico.
 * SOLO LECTURA en los dos ambientes, siempre.
 *
 * Complementa, no reemplaza, a invariante-stg-prod.ts (Capa 6). Capa 6
 * compara CONTEOS de filas por documento sobre el dataset entero — es
 * barato y corre rápido, pero tiene un punto ciego real: un documento con
 * el MISMO conteo de items en los dos ambientes puede tener un item_hash
 * distinto en algún renglón (un item cambiado, o un huérfano que reemplazó
 * a otro sin borrarlo). El conteo no lo ve.
 *
 * Este script sí lo ve: compara el SET COMPLETO de item_hash por documento,
 * no solo cuántos hay. Es deliberadamente más caro (trae cada fila de
 * sales_items del rango, no un COUNT/GROUP BY) — por eso pide un rango de
 * fechas en vez de correr sobre todo el histórico como Capa 6. Usalo como
 * segundo paso dirigido cuando Capa 6 da 0 divergencias pero hay motivo
 * para sospechar de un rango puntual (ej.: después de una recarga manual
 * de Excel, o cuando el newCount del preview de upload no coincide con lo
 * que Capa 6 esperaría — ver docs/INCIDENTE-2026-08-30-CORTESIAS.md y el
 * caso real de junio 2025 que motivó este script: X 00001-00001072 quedó
 * con un item duplicado — mismo conteo en los dos ambientes antes del
 * reload, pero un hash viejo (mayo 2026) que el Excel de junio 2025 nunca
 * volvió a producir).
 *
 * Uso:
 *   npx tsx scripts/diff-item-hashes.ts <FROM> <TO>
 *   npx tsx scripts/diff-item-hashes.ts 2025-06-01 2025-06-30
 *
 * Config (mismo patrón que scripts/invariante-stg-prod.ts / estado-real.ts):
 *   - STG:  PROJECT_REF (o derivado de NEXT_PUBLIC_SUPABASE_URL) y
 *           SUPABASE_ACCESS_TOKEN desde .env.staging
 *   - PROD: ídem desde .env.local.prod
 *   Override manual: STG_PROJECT_REF / STG_SUPABASE_ACCESS_TOKEN /
 *                     PROD_PROJECT_REF / PROD_SUPABASE_ACCESS_TOKEN
 *   Location por ambiente: NEXT_PUBLIC_LOCATION_ID del mismo archivo, o
 *                     override STG_LOCATION_ID / PROD_LOCATION_ID.
 *
 * Requiere los dos ambientes -- a diferencia de invariante-stg-prod.ts, no
 * tiene un modo parcial solo-STG: sin PROD no hay nada que diffear.
 */

import * as fs from 'fs'
import * as path from 'path'

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

// ── Rango de fechas (argumentos posicionales) ───────────────────────────────

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const [FROM, TO] = process.argv.slice(2)

function usageAndExit(): never {
  console.error('Uso: npx tsx scripts/diff-item-hashes.ts <FROM> <TO>')
  console.error('Ejemplo: npx tsx scripts/diff-item-hashes.ts 2025-06-01 2025-06-30')
  process.exit(1)
}

if (!FROM || !TO || !DATE_RE.test(FROM) || !DATE_RE.test(TO)) usageAndExit()
if (FROM > TO) { console.error('FROM debe ser <= TO'); process.exit(1) }

// ── SQL vía Management API (solo SELECT — nunca INSERT/UPDATE/DELETE) ──────

async function sqlQuery(env: EnvTarget, query: string): Promise<Record<string, unknown>[]> {
  const res = await fetch(`https://api.supabase.com/v1/projects/${env.ref}/database/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${env.token}` },
    body: JSON.stringify({ query }),
  })
  if (!res.ok) throw new Error(`SQL error ${res.status}: ${await res.text()}`)
  return res.json() as Promise<Record<string, unknown>[]>
}

type ItemRow = {
  external_id: string
  fecha_caja:  string
  item_hash:   string
  codigo:      number | null
  descripcion: string | null
  cantidad:        string | null
  precio_unitario: string | null
}

async function fetchItems(env: EnvTarget, from: string, to: string): Promise<ItemRow[]> {
  const rows = await sqlQuery(env, `
    SELECT
      si.numero_ticket AS external_id,
      si.fecha_caja::text AS fecha_caja,
      si.item_hash, si.codigo, si.descripcion,
      si.cantidad::text AS cantidad, si.precio_unitario::text AS precio_unitario
    FROM sales_items si
    WHERE si.location_id = '${env.locationId}'
      AND si.fecha_caja BETWEEN '${from}' AND '${to}'
  `)
  return rows.map(r => ({
    external_id: String(r.external_id),
    fecha_caja:  String(r.fecha_caja),
    item_hash:   String(r.item_hash),
    codigo:      r.codigo === null ? null : Number(r.codigo),
    descripcion: r.descripcion === null ? null : String(r.descripcion),
    cantidad:        r.cantidad === null ? null : String(r.cantidad),
    precio_unitario: r.precio_unitario === null ? null : String(r.precio_unitario),
  }))
}

function docKey(i: ItemRow): string {
  return `${i.external_id}|${i.fecha_caja}`
}

function shortHash(h: string): string {
  return h.slice(0, 12) + '…'
}

// ── Main ──────────────────────────────────────────────────────────────────

async function main() {
  const stgReady  = Boolean(STG.ref && STG.token && STG.locationId)
  const prodReady = Boolean(PROD.ref && PROD.token && PROD.locationId)

  console.log(`\n════════════════════════════════════════════════════════════`)
  console.log(`  DIFF ITEM_HASH STG vs PROD — ${FROM} a ${TO}`)
  console.log(`════════════════════════════════════════════════════════════\n`)

  if (!stgReady || !prodReady) {
    console.error(`Faltan credenciales — STG ready=${stgReady} PROD ready=${prodReady}.`)
    console.error('A diferencia de invariante-stg-prod.ts, este script no tiene modo parcial: sin los dos ambientes no hay nada que comparar.')
    process.exit(1)
  }

  console.log('Trayendo items del rango en STG y PROD...')
  const [stgItems, prodItems] = await Promise.all([
    fetchItems(STG, FROM, TO),
    fetchItems(PROD, FROM, TO),
  ])
  console.log(`   STG: ${stgItems.length} filas · PROD: ${prodItems.length} filas\n`)

  const stgHashes  = new Set(stgItems.map(i => i.item_hash))
  const prodHashes = new Set(prodItems.map(i => i.item_hash))

  const onlyInProd = prodItems.filter(i => !stgHashes.has(i.item_hash))
  const onlyInStg  = stgItems.filter(i => !prodHashes.has(i.item_hash))

  console.log(`── Hashes en PROD que STG no tiene (${onlyInProd.length}) ──────────────────\n`)
  if (onlyInProd.length === 0) {
    console.log('   Ninguno.')
  } else {
    for (const i of onlyInProd.slice(0, 50)) {
      console.log(`   - ${i.external_id} (${i.fecha_caja}) codigo=${i.codigo} "${i.descripcion}" cant=${i.cantidad} p.unit=${i.precio_unitario} hash=${shortHash(i.item_hash)}`)
    }
    if (onlyInProd.length > 50) console.log(`   ... y ${onlyInProd.length - 50} más`)
  }

  console.log(`\n── Hashes en STG que PROD no tiene (${onlyInStg.length}) ──────────────────\n`)
  if (onlyInStg.length === 0) {
    console.log('   Ninguno.')
  } else {
    for (const i of onlyInStg.slice(0, 50)) {
      console.log(`   - ${i.external_id} (${i.fecha_caja}) codigo=${i.codigo} "${i.descripcion}" cant=${i.cantidad} p.unit=${i.precio_unitario} hash=${shortHash(i.item_hash)}`)
    }
    if (onlyInStg.length > 50) console.log(`   ... y ${onlyInStg.length - 50} más`)
  }

  // El caso que motivó este script: mismo conteo en los dos ambientes,
  // distinto SET de hashes -- invisible para Capa 6.
  const byDocStg  = new Map<string, Set<string>>()
  const byDocProd = new Map<string, Set<string>>()
  for (const i of stgItems)  { const k = docKey(i); if (!byDocStg.has(k))  byDocStg.set(k, new Set());  byDocStg.get(k)!.add(i.item_hash) }
  for (const i of prodItems) { const k = docKey(i); if (!byDocProd.has(k)) byDocProd.set(k, new Set()); byDocProd.get(k)!.add(i.item_hash) }

  const sameCountDifferentHashes: string[] = []
  for (const [key, stgSet] of byDocStg) {
    const prodSet = byDocProd.get(key)
    if (!prodSet || stgSet.size !== prodSet.size) continue // conteo distinto -> ya lo cubre Capa 6
    if ([...stgSet].some(h => !prodSet.has(h))) sameCountDifferentHashes.push(key)
  }

  console.log(`\n── Documentos con MISMO conteo pero distinto SET de hashes (${sameCountDifferentHashes.length}) ──\n`)
  if (sameCountDifferentHashes.length === 0) {
    console.log('   Ninguno. El punto ciego de Capa 6 no se manifestó en este rango.')
  } else {
    for (const key of sameCountDifferentHashes.slice(0, 50)) console.log(`   - ${key}`)
    if (sameCountDifferentHashes.length > 50) console.log(`   ... y ${sameCountDifferentHashes.length - 50} más`)
  }

  console.log('\n── Resumen ──────────────────────────────────────────────────\n')
  const divergent = onlyInProd.length > 0 || onlyInStg.length > 0 || sameCountDifferentHashes.length > 0
  if (divergent) {
    console.log('   DIVERGENCIA de contenido de items en el rango. Exit code 1.')
    process.exit(1)
  }
  console.log('   Sin divergencias de contenido en el rango. Exit code 0.')
}

main().catch(e => { console.error('Fatal:', e); process.exit(1) })
