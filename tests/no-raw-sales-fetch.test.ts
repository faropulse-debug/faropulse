import { describe, it, expect } from 'vitest'
import fs   from 'fs'
import path from 'path'

/**
 * Invariante anti-regresión: ningún componente de frontend debe leer
 * sales_documents / sales_items crudo (ni vía supabase-js `.from(...)`, ni
 * vía fetch directo a `/rest/v1/...`).
 *
 * Motivo: ese patrón fue la causa raíz de dos bugs reales en Mix de Canales —
 * (a) bypass del conteo neteado (documento_peso) y (b) truncamiento silencioso
 * a las 1000 filas más viejas por el límite `max_rows` de PostgREST (HTTP 206),
 * que dejó el gráfico mostrando abril 2025 en vez de datos actuales.
 *
 * Todo dato de sales_documents/sales_items para UI debe salir de una función
 * RPC (get_*) que agregue en SQL — igual que el resto de los widgets, y como
 * exige el invariante de documento_peso en tests/documento-peso.test.ts.
 */

const RAW_FETCH_PATTERN = /\.from\(\s*['"](sales_documents|sales_items)['"]\s*\)|\/rest\/v1\/(sales_documents|sales_items)\b/

// Directorios de frontend a vigilar. app/api/** queda afuera (server-side,
// service_role) — el problema es específicamente sesión-de-usuario en el browser.
const SCAN_DIRS = [
  'src/components',
  'components',
  'src/hooks',
  'hooks',
  'app',
]

// Rutas legítimas dentro de esos árboles que SÍ deben tocar estas tablas
// (pipeline de ingesta/upload, no widgets de lectura) o que son server-only.
const ALLOWLIST_SUBSTRINGS = [
  `${path.sep}api${path.sep}`,   // app/api/** — rutas server-side (service_role)
]

function walk(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      walk(full, out)
    } else if (/\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith('.test.ts') && !entry.name.endsWith('.test.tsx')) {
      out.push(full)
    }
  }
  return out
}

describe('Invariante Anti-Regresión: sin fetch crudo de sales_documents/sales_items en frontend', () => {
  it('ningún archivo bajo components/hooks/app lee sales_documents o sales_items directo', () => {
    const root = process.cwd()
    const violations: string[] = []

    for (const dir of SCAN_DIRS) {
      const files = walk(path.join(root, dir))
      for (const file of files) {
        const rel = path.relative(root, file)
        if (ALLOWLIST_SUBSTRINGS.some(s => file.includes(s))) continue

        const content = fs.readFileSync(file, 'utf-8')
        if (RAW_FETCH_PATTERN.test(content)) {
          violations.push(rel)
        }
      }
    }

    if (violations.length > 0) {
      console.error('Archivos con fetch crudo de sales_documents/sales_items:')
      violations.forEach(v => console.error(`- ${v}`))
    }

    expect(violations).toEqual([])
  })
})
