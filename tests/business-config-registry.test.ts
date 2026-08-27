import { describe, it, expect } from 'vitest'
import * as fs   from 'fs'
import * as path from 'path'
import { BUSINESS_CONFIG_KEYS } from '@/lib/business-config'
import { WRITE_ROLES }          from '@/lib/authz'

/**
 * Invariante central de H3 Parte A: el registro TS (lib/business-config.ts)
 * y el CHECK constraint de la migración SQL tienen que decir exactamente
 * lo mismo. Si divergen, una clave queda aceptada por un lado y rechazada
 * por el otro — la misma clase de bug de "tres listas" que este diseño
 * existe para evitar (ver docstring de lib/business-config.ts).
 *
 * Se parsea el SQL en vez de hardcodear la lista esperada acá: si alguien
 * agrega una key al registro TS sin tocar la migración (o viceversa), el
 * parseo detecta la diferencia sin que este test necesite conocer de
 * antemano cuáles son las claves "correctas".
 */

const MIGRATION_PATH = path.resolve(
  process.cwd(),
  'supabase/migrations/20260826000001_location_business_config.sql',
)

function readMigration(): string {
  return fs.readFileSync(MIGRATION_PATH, 'utf8')
}

function extractKeyUnitPairsFromCheck(sql: string): Array<{ key: string; unit: string }> {
  // El grupo capturado debe terminar en el `)` del ÚLTIMO tuple (key = ... AND
  // unit = ...) para que la regex de abajo lo encuentre — de ahí el `\))`
  // (lazy hasta un paréntesis inclusive), no un `\)` suelto fuera del grupo,
  // que dejaría el último tuple sin su paréntesis de cierre en `body`.
  const match = sql.match(/location_business_config_key_unit_check CHECK \(([\s\S]*?\))\n  \),/)
  if (!match) throw new Error('No se encontró location_business_config_key_unit_check en la migración')
  const body = match[1]
  const pairs: Array<{ key: string; unit: string }> = []
  const re = /\(key = '([a-z0-9_]+)'\s+AND unit = '([A-Za-z_]+)'\)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(body)) !== null) {
    pairs.push({ key: m[1], unit: m[2] })
  }
  return pairs
}

function extractWriteRolesFromSql(sql: string): string[] {
  const match = sql.match(/AND m\.role IN \(([^)]+)\)/)
  if (!match) throw new Error('No se encontró el chequeo de rol en user_has_write_role')
  return match[1]
    .split(',')
    .map(s => s.trim().replace(/^'/, '').replace(/'$/, ''))
    .filter(Boolean)
}

describe('business config: registro TS vs CHECK de la migración', () => {
  it('toda key del registro TS existe en el CHECK de la migración con la misma unit', () => {
    const sql = readMigration()
    const sqlPairs = extractKeyUnitPairsFromCheck(sql)
    const sqlByKey = new Map(sqlPairs.map(p => [p.key, p.unit]))

    for (const [key, def] of Object.entries(BUSINESS_CONFIG_KEYS)) {
      expect(sqlByKey.has(key), `key "${key}" del registro TS no está en el CHECK de la migración`).toBe(true)
      expect(sqlByKey.get(key), `unit de "${key}" difiere entre TS (${def.unit}) y SQL`).toBe(def.unit)
    }
  })

  it('toda key del CHECK de la migración existe en el registro TS', () => {
    const sql = readMigration()
    const sqlPairs = extractKeyUnitPairsFromCheck(sql)

    for (const { key } of sqlPairs) {
      expect(
        Object.prototype.hasOwnProperty.call(BUSINESS_CONFIG_KEYS, key),
        `key "${key}" está en el CHECK de la migración pero no en el registro TS`,
      ).toBe(true)
    }
  })

  it('no hay keys duplicadas dentro del CHECK de la migración', () => {
    const sql = readMigration()
    const sqlPairs = extractKeyUnitPairsFromCheck(sql)
    const keys = sqlPairs.map(p => p.key)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('el conjunto de roles de user_has_write_role (SQL) coincide con WRITE_ROLES (lib/authz.ts)', () => {
    const sql = readMigration()
    const sqlRoles = extractWriteRolesFromSql(sql).sort()
    const tsRoles  = [...WRITE_ROLES].sort()
    expect(sqlRoles).toEqual(tsRoles)
  })
})
