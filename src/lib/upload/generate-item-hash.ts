import { createHash } from 'crypto'

const money = (n: number | null | undefined): string =>
  n == null ? '' : Number(n).toFixed(2)

const qty = (n: number | null | undefined): string =>
  n == null ? '' : Number(n).toFixed(4)

/**
 * Portable item-level hash using only business-semantic fields available in any POS.
 * Fields: numero_ticket | fecha_caja | descripcion | cantidad | precio_total | occurrence
 *
 * `occurrence` is a 0-indexed counter per content group (same 5 fields) within a file,
 * assigned by enrichRows before insertion. The resulting SET of hashes for a file is
 * invariant to row reordering — if Maxirest reorders identical items, the same hash set
 * is produced, making re-uploads fully idempotent.
 *
 * Mirror of SQL function public.generate_item_hash() — both must produce identical output.
 * Money: toFixed(2) ↔ ROUND(x,2)::text  |  Quantity: toFixed(4) ↔ ROUND(x,4)::text
 */
export function generateItemHash(d: {
  numero_ticket: string | null
  fecha_caja:    string | null   // 'YYYY-MM-DD'
  descripcion:   string | null
  cantidad:      number | null
  precio_total:  number | null
  occurrence:    number           // 0-indexed, per content group within the file
}): string {
  const parts = [
    d.numero_ticket ?? '',
    d.fecha_caja    ?? '',
    d.descripcion   ?? '',
    qty(d.cantidad),
    money(d.precio_total),
    String(d.occurrence),
  ]
  return createHash('sha256').update(parts.join('|')).digest('hex')
}
