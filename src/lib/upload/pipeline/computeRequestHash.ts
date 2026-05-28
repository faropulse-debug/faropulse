import { createHash } from 'crypto'

// SHA256 del archivo completo = idempotency key a nivel request (estilo Stripe)
export function computeRequestHash(buffer: ArrayBuffer): string {
  return createHash('sha256').update(new Uint8Array(buffer)).digest('hex')
}
