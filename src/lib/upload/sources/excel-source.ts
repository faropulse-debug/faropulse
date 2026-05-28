import * as XLSX from 'xlsx'
import type { DataSource } from '../contracts/types'

// Extracts rows from an Excel file as AsyncIterable.
// Source-agnostic: does NOT assume Maxirest or any specific POS.
// Auto-detects the first sheet that contains at least one data row.
export async function* extractFromExcel(
  source: DataSource,
): AsyncIterable<Record<string, unknown>> {
  const file = source.payload as File
  const buffer = await file.arrayBuffer()
  const wb = XLSX.read(new Uint8Array(buffer), { type: 'array' })

  let sheet: XLSX.WorkSheet | null = null
  for (const name of wb.SheetNames) {
    const s = wb.Sheets[name]
    const rows = XLSX.utils.sheet_to_json(s, { defval: null })
    if (rows.length > 0) { sheet = s; break }
  }
  if (!sheet) return

  const rows = XLSX.utils.sheet_to_json(sheet, { defval: null }) as Record<string, unknown>[]
  for (const row of rows) {
    yield row
  }
}
