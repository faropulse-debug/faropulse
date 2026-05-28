// eslint-disable-next-line @typescript-eslint/no-explicit-any
import type { DataSourceContract } from '../contracts/types'
import type { SvcHeaders } from './types'

const BATCH = 200

/**
 * Deletes rows from contract.table matching location_id and a list of hashes,
 * chunked to stay within Supabase URL limits. Throws on any failed chunk.
 */
export async function deleteByHashes(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  contract:   DataSourceContract<any>,
  locationId: string,
  hashes:     string[],
  supaUrl:    string,
  svc:        SvcHeaders,
): Promise<number> {
  if (hashes.length === 0) return 0

  const col       = String(Array.isArray(contract.hashColumn) ? contract.hashColumn[0] : contract.hashColumn)
  const { table } = contract
  let deleted     = 0
  const total     = Math.ceil(hashes.length / BATCH)

  for (let i = 0; i < hashes.length; i += BATCH) {
    const chunk = hashes.slice(i, i + BATCH)
    const inVal = `in.(${chunk.map(h => `"${h}"`).join(',')})`
    const url   = `${supaUrl}/rest/v1/${table}?location_id=eq.${encodeURIComponent(locationId)}&${col}=${encodeURIComponent(inVal)}`
    const n     = Math.floor(i / BATCH) + 1
    console.log(`[pipeline] DELETE ${table} by ${col} chunk=${n}/${total} hashes=${chunk.length}`)
    const res = await fetch(url, {
      method:  'DELETE',
      headers: { ...svc, Prefer: 'return=representation' },
    })
    if (!res.ok) {
      const text = await res.text()
      console.error(`[pipeline] DELETE ${table} chunk=${n} FAILED status=${res.status}: ${text.slice(0, 200)}`)
      throw new Error(`DELETE ${table} chunk ${n}: ${text.slice(0, 200)}`)
    }
    const rows = await res.json()
    deleted   += Array.isArray(rows) ? rows.length : 0
  }
  console.log(`[pipeline] DELETE ${table} total deleted=${deleted}`)
  return deleted
}
