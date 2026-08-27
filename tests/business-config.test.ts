import { describe, it, expect } from 'vitest'
import {
  BUSINESS_CONFIG_KEYS,
  isBusinessConfigKey,
  isValidBusinessConfigValue,
  toBusinessConfigLookup,
  type BusinessConfigKey,
  type BusinessConfigUnit,
} from '@/lib/business-config'

function findKeyByUnit(unit: BusinessConfigUnit): BusinessConfigKey {
  const entry = Object.entries(BUSINESS_CONFIG_KEYS).find(([, d]) => d.unit === unit)
  if (!entry) throw new Error(`No hay ninguna key con unit "${unit}" en el registro`)
  return entry[0] as BusinessConfigKey
}

describe('isBusinessConfigKey', () => {
  it('acepta toda key declarada en el registro', () => {
    for (const key of Object.keys(BUSINESS_CONFIG_KEYS)) {
      expect(isBusinessConfigKey(key)).toBe(true)
    }
  })

  it('rechaza una key desconocida', () => {
    expect(isBusinessConfigKey('esto_no_existe')).toBe(false)
  })
})

describe('isValidBusinessConfigValue — invariantes por unidad, no valores puntuales', () => {
  it('ARS: acepta cualquier número finito > 0, rechaza <= 0 y no-números', () => {
    const key = findKeyByUnit('ARS')
    expect(isValidBusinessConfigValue(key, 1)).toBe(true)
    expect(isValidBusinessConfigValue(key, 0.01)).toBe(true)
    expect(isValidBusinessConfigValue(key, 0)).toBe(false)
    expect(isValidBusinessConfigValue(key, -1)).toBe(false)
    expect(isValidBusinessConfigValue(key, Infinity)).toBe(false)
    expect(isValidBusinessConfigValue(key, NaN)).toBe(false)
    expect(isValidBusinessConfigValue(key, '100')).toBe(false)
    expect(isValidBusinessConfigValue(key, null)).toBe(false)
  })

  it('pct: acepta el rango cerrado [0,100], rechaza fuera de rango', () => {
    const key = findKeyByUnit('pct')
    expect(isValidBusinessConfigValue(key, 0)).toBe(true)
    expect(isValidBusinessConfigValue(key, 100)).toBe(true)
    expect(isValidBusinessConfigValue(key, 50.5)).toBe(true)
    expect(isValidBusinessConfigValue(key, -0.01)).toBe(false)
    expect(isValidBusinessConfigValue(key, 100.01)).toBe(false)
    expect(isValidBusinessConfigValue(key, '30')).toBe(false)
  })

  it('ratio: acepta el rango cerrado [0,1] — NO [0,100]', () => {
    const key = findKeyByUnit('ratio')
    expect(isValidBusinessConfigValue(key, 0)).toBe(true)
    expect(isValidBusinessConfigValue(key, 1)).toBe(true)
    expect(isValidBusinessConfigValue(key, 0.15)).toBe(true)
    // Guarda de regresión: si alguien "arregla" el _pct del nombre para que
    // acepte 0-100, este valor tiene que seguir siendo inválido.
    expect(isValidBusinessConfigValue(key, 15)).toBe(false)
    expect(isValidBusinessConfigValue(key, 1.01)).toBe(false)
    expect(isValidBusinessConfigValue(key, -0.01)).toBe(false)
  })

})

describe('toBusinessConfigLookup — "no configurado" es AUSENCIA, nunca 0', () => {
  it('una key sin fila en el resultado de la RPC queda ausente del lookup (no undefined-como-0)', () => {
    const lookup = toBusinessConfigLookup([
      { key: 'benchmark_laboral_pct', value: 32, unit: 'pct', updated_at: '2026-08-01T00:00:00Z' },
    ])
    expect(lookup.benchmark_laboral_pct).toBeDefined()
    expect(lookup.benchmark_laboral_pct?.value).toBe(32)
    // Las otras 4 claves de Parte A no vinieron en las rows → no están en el lookup.
    expect('inversion_ars' in lookup).toBe(false)
    expect('cv_umbral_saludable_pct' in lookup).toBe(false)
    expect(lookup.inversion_ars).toBeUndefined()
  })

  it('un valor configurado en 0 se distingue de "no configurado" (se preserva el 0, no se descarta)', () => {
    // 0 es válido para 'pct'/'ratio' (rango cerrado incluye el 0) — el lookup
    // tiene que preservarlo como presente, no tratarlo como ausente.
    const lookup = toBusinessConfigLookup([
      { key: 'cv_umbral_saludable_pct', value: 0, unit: 'pct', updated_at: '2026-08-01T00:00:00Z' },
    ])
    expect('cv_umbral_saludable_pct' in lookup).toBe(true)
    expect(lookup.cv_umbral_saludable_pct?.value).toBe(0)
  })

  it('ignora claves desconocidas en vez de inventar una entrada (defensa ante drift entre DB y registro TS)', () => {
    const lookup = toBusinessConfigLookup([
      { key: 'una_clave_que_no_existe', value: 999, unit: 'pct', updated_at: '2026-08-01T00:00:00Z' },
    ])
    expect(Object.keys(lookup).length).toBe(0)
  })

  it('resultado vacío → lookup vacío (ninguna key configurada, no crashea)', () => {
    expect(toBusinessConfigLookup([])).toEqual({})
  })
})
