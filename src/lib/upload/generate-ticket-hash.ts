import { createHash } from 'crypto'

// Stable 2-decimal representation for money fields to avoid floating-point
// drift between POS exports (e.g. 30.11439114 vs 30.114391143911433 → "30.11").
const money = (n: number | null | undefined): string =>
  n == null ? '' : Number(n).toFixed(2)

export function generateTicketHash(d: {
  external_id:    string | null
  fecha_caja:     string | null
  hora:           string | null
  camarero:       string | null
  total:          number | null
  comensales:     number | null
  cliente:        string | null
  tipo_documento: string | null
  punto_venta:    string | null
  zona:           string | null
  descuento:      number | null
  recargo:        number | null
}): string {
  const parts = [
    d.external_id    == null ? '' : String(d.external_id),
    d.fecha_caja     == null ? '' : String(d.fecha_caja),
    d.hora           == null ? '' : String(d.hora),
    d.camarero       == null ? '' : String(d.camarero),
    money(d.total),
    d.comensales     == null ? '' : String(d.comensales),
    d.cliente        == null ? '' : String(d.cliente),
    d.tipo_documento == null ? '' : String(d.tipo_documento),
    d.punto_venta    == null ? '' : String(d.punto_venta),
    d.zona           == null ? '' : String(d.zona),
    money(d.descuento),
    money(d.recargo),
  ]
  return createHash('sha256').update(parts.join('|')).digest('hex')
}
