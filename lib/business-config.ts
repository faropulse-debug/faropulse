/**
 * Registro canónico de claves de configuración de negocio por location.
 *
 * ÚNICA fuente de verdad para qué claves existen, qué unidad tienen y qué
 * forma de valor es válida. El CHECK constraint
 * `location_business_config_key_unit_check` en
 * supabase/migrations/20260826000001_location_business_config.sql tiene que
 * decir lo mismo — tests/business-config-registry.test.ts lo verifica
 * parseando esa migración contra este archivo.
 *
 * Si agregás una clave acá, agregala también al CHECK de la migración (o a
 * una migración nueva aditiva). Si no lo hacés, el test de sincronización
 * falla — a propósito: la clave quedaría aceptada por la app pero rechazada
 * por la DB (o viceversa), la misma clase de bug de "tres listas" que este
 * diseño existe para evitar.
 *
 * CONTRATO PARA CONSUMIDORES (Parte B / Codex):
 * Una clave ausente en el resultado de get_location_business_config
 * significa "no configurado". NUNCA tratarlo como 0 ni como cualquier otro
 * default. null/undefined ≠ 0.
 */

export type BusinessConfigUnit = 'ARS' | 'pct' | 'ratio' | 'comensales_dia'

export interface BusinessConfigKeyDef {
  /** Unidad de almacenamiento. 'pct' = escala 0-100. 'ratio' = escala 0-1. */
  unit: BusinessConfigUnit
  /** Descripción corta para UI/logs — no es la fuente de verdad de negocio. */
  label: string
}

/**
 * Las 5 claves de Parte A. Las 7 restantes del modelo de proyección
 * (comensales_por_dia, inflacion_mensual, delivery_pct, cv_pct_proyeccion,
 * cf_crecimiento_mensual, regalias_pct, diciembre_estacional_pct) son
 * Parte A.2 — no agregarlas acá sin agregar también su CHECK en una
 * migración nueva.
 */
export const BUSINESS_CONFIG_KEYS = {
  inversion_ars: {
    unit: 'ARS',
    label: 'Inversión total del negocio',
  },
  benchmark_laboral_pct: {
    unit: 'pct',
    label: 'Benchmark de costo laboral sobre ventas (sector)',
  },
  cv_umbral_saludable_pct: {
    unit: 'pct',
    label: 'Umbral de costo de ventas considerado saludable',
  },
  cv_umbral_elevado_pct: {
    unit: 'pct',
    label: 'Umbral de costo de ventas considerado elevado',
  },
  mc_objetivo_pct: {
    unit: 'ratio',
    label: 'Margen de contribución objetivo (escala 0-1, no 0-100)',
  },
} as const satisfies Record<string, BusinessConfigKeyDef>

export type BusinessConfigKey = keyof typeof BUSINESS_CONFIG_KEYS

export function isBusinessConfigKey(key: string): key is BusinessConfigKey {
  return Object.prototype.hasOwnProperty.call(BUSINESS_CONFIG_KEYS, key)
}

/**
 * Valida que `value` tenga la forma correcta para la unidad de `key`.
 * Espejo en runtime de location_business_config_value_shape_check (DB) —
 * ambos existen porque el CHECK de la DB es la última línea de defensa,
 * no la única: esta validación corre antes del INSERT/UPDATE y puede dar
 * un error legible al caller en vez de un 500 por constraint violation.
 */
export function isValidBusinessConfigValue(key: BusinessConfigKey, value: unknown): boolean {
  // Ancho explícito a BusinessConfigUnit: BUSINESS_CONFIG_KEYS hoy solo usa
  // 'ARS'|'pct'|'ratio' (Parte A), por lo que TS infiere ese subconjunto y
  // marcaría 'comensales_dia' (A.2, ya soportado por este validador) como
  // inalcanzable.
  const unit = BUSINESS_CONFIG_KEYS[key].unit as BusinessConfigUnit
  switch (unit) {
    case 'ARS':
      return typeof value === 'number' && Number.isFinite(value) && value > 0
    case 'pct':
      return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100
    case 'ratio':
      return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1
    case 'comensales_dia':
      return (
        Array.isArray(value) &&
        value.length === 7 &&
        value.every(n => typeof n === 'number' && Number.isFinite(n) && n >= 0 && Number.isInteger(n))
      )
  }
}

export interface BusinessConfigRow {
  key:        string
  value:      unknown
  unit:       string
  updated_at: string
}

/**
 * Resultado de get_location_business_config, tipado por clave.
 * Una clave ausente de `rows` está ausente acá también — nunca se
 * rellena con un default. Ver contrato en el docstring del módulo.
 */
export type BusinessConfigLookup = Partial<
  Record<BusinessConfigKey, { value: unknown; unit: BusinessConfigUnit; updatedAt: string }>
>

export function toBusinessConfigLookup(rows: BusinessConfigRow[]): BusinessConfigLookup {
  const lookup: BusinessConfigLookup = {}
  for (const row of rows) {
    if (!isBusinessConfigKey(row.key)) continue // clave desconocida (p.ej. de una A.2 futura) — se ignora, no se inventa
    lookup[row.key] = { value: row.value, unit: row.unit as BusinessConfigUnit, updatedAt: row.updated_at }
  }
  return lookup
}
