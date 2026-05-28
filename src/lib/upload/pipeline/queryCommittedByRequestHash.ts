import type { SvcHeaders } from './types'

export interface CommittedCacheEntry {
  event_id: string
  payload:  Record<string, unknown>
}

/**
 * Returns the most recent upload.committed event for the given
 * requestHash/contractId/locationId in the last 24 hours, or null if none.
 */
export async function queryCommittedByRequestHash(
  requestHash: string,
  contractId:  string,
  locationId:  string,
  supaUrl:     string,
  svc:         SvcHeaders,
): Promise<CommittedCacheEntry | null> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  const params = new URLSearchParams({
    'event_type':              'eq.upload.committed',
    'contract_id':             `eq.${contractId}`,
    'location_id':             `eq.${locationId}`,
    'payload->>requestHash':   `eq.${requestHash}`,
    'created_at':              `gte.${since}`,
    'order':                   'created_at.desc',
    'limit':                   '1',
    'select':                  'event_id,payload',
  })

  const res = await fetch(`${supaUrl}/rest/v1/upload_events?${params}`, { headers: svc })

  if (!res.ok) return null

  const rows = (await res.json()) as CommittedCacheEntry[]
  return rows.length > 0 ? rows[0] : null
}
