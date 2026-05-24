import { createHash } from 'crypto'

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
    d.external_id, d.fecha_caja, d.hora, d.camarero, d.total, d.comensales,
    d.cliente, d.tipo_documento, d.punto_venta, d.zona, d.descuento, d.recargo,
  ].map(v => v == null ? '' : String(v))
  return createHash('sha256').update(parts.join('|')).digest('hex')
}
