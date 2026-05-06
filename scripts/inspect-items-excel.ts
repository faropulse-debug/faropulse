/**
 * Inspecciona los headers y valores de muestra de un Excel de items.
 * Uso: npx tsx scripts/inspect-items-excel.ts <ruta-al-excel>
 */

import * as XLSX from 'xlsx'
import * as fs   from 'fs'

const file = process.argv[2]
if (!file) {
  console.error('Uso: npx tsx scripts/inspect-items-excel.ts <ruta>')
  process.exit(1)
}
if (!fs.existsSync(file)) {
  console.error(`Archivo no encontrado: ${file}`)
  process.exit(1)
}

function normalizeHeader(h: string): string {
  return String(h).trim()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, '_')
}

const DATE_HINTS = ['fecha', 'date', 'caja', 'mes', 'dia', 'año', 'anio', 'time', 'hora', 'inicio', 'cierre']

const wb    = XLSX.read(fs.readFileSync(file), { type: 'buffer', cellDates: true })
const sheet = wb.Sheets[wb.SheetNames[0]]
const rows  = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
  defval: '', raw: false, dateNF: 'yyyy-mm-dd',
})

if (rows.length === 0) { console.error('Hoja vacía'); process.exit(1) }

const rawHeaders = Object.keys(rows[0])

console.log(`\nArchivo:  ${file}`)
console.log(`Hoja:     ${wb.SheetNames[0]}`)
console.log(`Filas:    ${rows.length}`)
console.log(`Columnas: ${rawHeaders.length}\n`)

// ── Todas las columnas ────────────────────────────────────────────────────────
console.log('=== Todas las columnas ===')
for (const h of rawHeaders) {
  const key     = normalizeHeader(h)
  const sample1 = rows[0]?.[h]
  const sample2 = rows[1]?.[h]
  console.log(`  "${h}" → key="${key}"  samples: [${sample1}, ${sample2}]`)
}

// ── Columnas con apariencia de fecha ─────────────────────────────────────────
console.log('\n=== Columnas que parecen fecha ===')
const dateCols = rawHeaders.filter(h =>
  DATE_HINTS.some(hint => h.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').includes(hint))
)

if (dateCols.length === 0) {
  console.log('  (ninguna detectada)')
} else {
  for (const h of dateCols) {
    const key     = normalizeHeader(h)
    const samples = rows.slice(0, 5).map(r => r[h]).filter(v => v !== '').slice(0, 3)
    console.log(`  "${h}" → key="${key}"`)
    console.log(`    valores: ${samples.map(v => JSON.stringify(v)).join(', ')}`)
  }
}
