 
import type { DataSourceContract } from '../contracts/types'
import type { SvcHeaders } from './types'

/**
 * Calls the commit_upload Postgres RPC, which performs DELETE + INSERT atomically.
 * If the INSERT fails the DELETE is automatically rolled back.
 */
export async function commitUpload(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  contract:   DataSourceContract<any>,
  locationId: string,
  hashes:     string[],
  rows:       Record<string, unknown>[],
  supaUrl:    string,
  svc:        SvcHeaders,
): Promise<{ deleted: number; inserted: number }> {
  const hashColumn = String(
    Array.isArray(contract.hashColumn) ? contract.hashColumn[0] : contract.hashColumn,
  )

  const res = await fetch(`${supaUrl}/rest/v1/rpc/commit_upload`, {
    method:  'POST',
    headers: svc,
    body:    JSON.stringify({
      p_table:       contract.table,
      p_location_id: locationId,
      p_hash_column: hashColumn,
      p_hashes:      hashes,
      p_rows:        rows,
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`commit_upload RPC failed (${res.status}): ${body.slice(0, 300)}`)
  }

  const data = await res.json() as { deleted?: number; inserted?: number }
  return { deleted: data.deleted ?? 0, inserted: data.inserted ?? 0 }
}
