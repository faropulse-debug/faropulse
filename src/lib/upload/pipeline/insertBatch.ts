import type { SvcHeaders } from './types'

const BATCH = 200

/**
 * Inserts rows into a Supabase table in chunks of 200.
 * Logs failures but does not throw — failed rows are reflected in the returned count.
 */
export async function insertBatch(
  table:  string,
  rows:   Record<string, unknown>[],
  supaUrl: string,
  svc:    SvcHeaders,
): Promise<{ inserted: number; failed: number }> {
  let inserted = 0
  let failed   = 0
  const total  = Math.ceil(rows.length / BATCH)

  for (let i = 0; i < rows.length; i += BATCH) {
    const batch    = rows.slice(i, i + BATCH)
    const batchNum = Math.floor(i / BATCH) + 1
    console.log(`[pipeline] INSERT ${table} batch=${batchNum}/${total} rows=${batch.length}`)
    const res = await fetch(`${supaUrl}/rest/v1/${table}`, {
      method:  'POST',
      headers: svc,
      body:    JSON.stringify(batch),
    })
    if (!res.ok) {
      const text = await res.text()
      console.error(`[pipeline] INSERT ${table} batch=${batchNum} FAILED status=${res.status}: ${text}`)
      failed += batch.length
    } else {
      inserted += batch.length
    }
  }
  return { inserted, failed }
}
