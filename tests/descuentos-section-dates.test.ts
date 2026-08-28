import { describe, it, expect } from 'vitest'
import { firstDayOfMonth, lastDayOfMonth } from '@/src/components/widgets/sections/DescuentosSection'

// Regresión: lastDayOfMonth() colapsaba a firstDayOfMonth() bajo timezones
// negativos (UTC-3, Uruguay/Argentina — el timezone real del cliente) porque
// parseaba un string ISO ("2026-08-01") con new Date(), que interpreta la
// fecha como medianoche UTC, y después mutaba con getMonth()/setMonth()/
// setDate(0), que operan en hora LOCAL. El corrimiento de zona hacía que el
// mes calculado quedara mal, y get_descuentos_top_tickets recibía p_hasta
// igual a p_desde: solo devolvía los tickets del día 1, no del mes entero.
describe('lastDayOfMonth — no depende del timezone local', () => {
  it('devuelve el último día de agosto (31), no el primero', () => {
    expect(lastDayOfMonth('2026-08-05')).toBe('2026-08-31')
  })

  it('devuelve el último día de febrero en año no bisiesto (28)', () => {
    expect(lastDayOfMonth('2026-02-10')).toBe('2026-02-28')
  })

  it('devuelve el último día de febrero en año bisiesto (29)', () => {
    expect(lastDayOfMonth('2024-02-10')).toBe('2024-02-29')
  })

  it('devuelve el último día de diciembre (31), cruzando de año', () => {
    expect(lastDayOfMonth('2026-12-01')).toBe('2026-12-31')
  })

  it('nunca coincide con firstDayOfMonth para un mes de más de 1 día', () => {
    const iso = '2026-08-15'
    expect(lastDayOfMonth(iso)).not.toBe(firstDayOfMonth(iso))
  })
})
