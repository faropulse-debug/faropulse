// eslint-disable-next-line @typescript-eslint/no-explicit-any
import type { DataSourceContract } from '../contracts/types'
import type { SvcHeaders } from './types'

const BATCH = 200

/**
 * Queries which hashes from the given list already exist in contract.table,
 * chunked to stay within Supabase URL limits.
 */
export async function queryExistingHashes(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  contract:   DataSourceContract<any>,
  locationId: string,
  hashes:     string[],
  supaUrl:    string,
  svc:        SvcHeaders,
): Promise<Set<string>> {
  if (hashes.length === 0) return new Set()

  const col      = String(Array.isArray(contract.hashColumn) ? contract.hashColumn[0] : contract.hashColumn)
  const { table } = contract
  const existing  = new Set<string>()

  for (let i = 0; i < hashes.length; i += BATCH) {
    const chunk = hashes.slice(i, i + BATCH)
    const inVal = `in.(${chunk.map(h => `"${h}"`).join(',')})`
    const url   = `${supaUrl}/rest/v1/${table}?location_id=eq.${encodeURIComponent(locationId)}&${col}=${encodeURIComponent(inVal)}&select=${col}`
    const res   = await fetch(url, { headers: svc })
    if (res.ok) {
      const rows = await res.json() as Record<string, string>[]
      for (const r of rows) existing.add(r[col])
    } else {
      const body = await res.text()
      throw new Error(
        `[pipeline] queryExistingHashes ${table} chunk=${Math.floor(i / BATCH) + 1} failed: ${res.status} ${body}`,
      )
    }
  }
  return existing
}
