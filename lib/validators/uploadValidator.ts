import * as XLSX from 'xlsx'

// ─── Table schemas ────────────────────────────────────────────────────────────

export type TableType = 'ventas' | 'items' | 'stock' | 'precios' | 'financial'

interface ColumnDef {
  name:     string
  required: boolean
  type:     'date' | 'number' | 'string'
}

export const TABLE_SCHEMAS: Record<TableType, { label: string; columns: ColumnDef[] }> = {
  ventas: {
    label: 'Ventas (sales_documents)',
    columns: [
      // ── Obligatorias ────────────────────────────────────────────────────────
      // Excel header "Numero" normalizes to "numero" → maps to external_id in DB
      { name: 'numero',          required: true,  type: 'string' },
      { name: 'sucursal',        required: true,  type: 'string' },
      { name: 'fecha',           required: true,  type: 'date'   },
      { name: 'fecha_caja',      required: true,  type: 'date'   },
      { name: 'total',           required: true,  type: 'number' },
      { name: 'tipo_documento',  required: true,  type: 'string' },
      // ── Opcionales ──────────────────────────────────────────────────────────
      { name: 'fecha_inicio',    required: false, type: 'date'   },   // timestamptz en DB
      { name: 'fecha_cierre',    required: false, type: 'date'   },   // timestamptz en DB
      // "hora" puede llegar como número decimal de Excel (0.458 → "11:00")
      { name: 'hora',            required: false, type: 'string' },
      { name: 'comensales',      required: false, type: 'number' },
      { name: 'descuento',       required: false, type: 'number' },
      { name: 'recargo',         required: false, type: 'number' },
      { name: 'formas_pago',     required: false, type: 'string' },
      { name: 'camarero',            required: false, type: 'string' },
      { name: 'camarero_nombre',     required: false, type: 'string' },
      // normalizeHeader quita tildes: "Obs. Promoción" → "obs._promocion", "Promoción" → "promocion"
      { name: 'obs._promocion',      required: false, type: 'string' },
      { name: 'promocion',           required: false, type: 'string' },
      { name: 'cliente',             required: false, type: 'string' },
      // Columnas adicionales presentes en el Excel del sistema POS
      { name: 'punto_venta',         required: false, type: 'string' },
      { name: 'tipo_zona',           required: false, type: 'string' },
      { name: 'zona',                required: false, type: 'string' },
      { name: 'turno',               required: false, type: 'string' },
      { name: 'anio_caja',           required: false, type: 'string' },
      { name: 'mes',                 required: false, type: 'string' },
      { name: 'mes_caja',            required: false, type: 'string' },
      { name: 'dia',                 required: false, type: 'string' },
      { name: 'dia_caja',            required: false, type: 'string' },
      { name: 'iva_venta',           required: false, type: 'string' },
      { name: 'usuario',             required: false, type: 'string' },
      { name: 'tipo_sucursal',       required: false, type: 'string' },
      { name: 'cantidad_documentos', required: false, type: 'number' },
    ],
  },
  items: {
    label: 'Items de ventas (sales_items)',
    columns: [
      // ── Obligatorias ────────────────────────────────────────────────────────
      // "Numero" del item en el POS → external_id (UNIQUE con location_id)
      { name: 'external_id',    required: true,  type: 'string' },
      // "Numero Ticket" → vincula el item con su sales_document (external_id de ventas)
      { name: 'numero_ticket',  required: true,  type: 'string' },
      { name: 'fecha_documento',required: true,  type: 'date'   },
      { name: 'descripcion',    required: true,  type: 'string' },
      { name: 'cantidad',       required: true,  type: 'number' },
      { name: 'precio_total',   required: true,  type: 'number' },
      // ── Opcionales ──────────────────────────────────────────────────────────
      { name: 'codigo',          required: false, type: 'number' },
      { name: 'sucursal',        required: false, type: 'string' },
      { name: 'punto_venta',     required: false, type: 'string' },
      { name: 'camarero',        required: false, type: 'string' },
      { name: 'camarero_nombre', required: false, type: 'string' },
      { name: 'apellido_nombre', required: false, type: 'string' },
      { name: 'tipo_documento',  required: false, type: 'string' },
      { name: 'tipo_sucursal',   required: false, type: 'string' },
      { name: 'fecha_inicio',    required: false, type: 'date'   },   // timestamptz en DB
      { name: 'fecha_cierre',    required: false, type: 'date'   },   // timestamptz en DB
      { name: 'fecha_caja',      required: false, type: 'date'   },
      { name: 'fecha_item',      required: false, type: 'date'   },   // timestamptz en DB
      { name: 'hora_item',       required: false, type: 'string' },
      { name: 'dia_caja',        required: false, type: 'string' },
      { name: 'mes_caja',        required: false, type: 'string' },
      { name: 'anio_caja',       required: false, type: 'string' },
      { name: 'turno',           required: false, type: 'string' },
      { name: 'nro_caja',        required: false, type: 'number' },
      { name: 'familia',         required: false, type: 'string' },
      { name: 'subfamilia',      required: false, type: 'string' },
      { name: 'marca',           required: false, type: 'string' },
      { name: 'es_variacion',    required: false, type: 'string' },
      { name: 'tipo_zona',       required: false, type: 'string' },
      { name: 'zona',            required: false, type: 'string' },
      { name: 'zona_id',         required: false, type: 'number' },
      { name: 'precio_unitario', required: false, type: 'number' },
      { name: 'descuento_item',  required: false, type: 'number' },
      { name: 'recargo_item',    required: false, type: 'number' },
      { name: 'descuento_global',required: false, type: 'number' },
      { name: 'recargo_global',  required: false, type: 'number' },
      // "Obs. Promoción" → normalizeHeader → "obs._promocion"
      { name: 'obs._promocion',          required: false, type: 'string' },
      { name: 'promocion',               required: false, type: 'string' },
      { name: 'observaciones_promocion', required: false, type: 'string' },
    ],
  },
  stock: {
    label: 'Stock (stock_movements)',
    columns: [
      { name: 'external_id',    required: true,  type: 'string' },
      { name: 'sucursal',       required: true,  type: 'string' },
      { name: 'numero',         required: false, type: 'string' },
      { name: 'tipo_documento', required: true,  type: 'string' },
      { name: 'descripcion',    required: true,  type: 'string' },
      { name: 'unidad_medida',  required: false, type: 'string' },
      { name: 'cantidad',       required: true,  type: 'number' },
      { name: 'fecha',          required: true,  type: 'date'   },
      { name: 'observaciones',  required: false, type: 'string' },
    ],
  },
  precios: {
    label: 'Precios (product_prices)',
    columns: [
      { name: 'external_id',   required: true,  type: 'string' },
      { name: 'codigo',        required: true,  type: 'string' },
      { name: 'denominacion',  required: true,  type: 'string' },
      { name: 'familia',       required: false, type: 'string' },
      { name: 'subfamilia',    required: false, type: 'string' },
      { name: 'marca',         required: false, type: 'string' },
      { name: 'unidad_medida', required: false, type: 'string' },
      { name: 'tipo',          required: false, type: 'string' },
      { name: 'tarifa',        required: false, type: 'string' },
      { name: 'precio_venta',  required: true,  type: 'number' },
      { name: 'pantalla',      required: false, type: 'string' },
    ],
  },
  financial: {
    label: 'P&L (financial_results)',
    columns: [
      { name: 'periodo',   required: true, type: 'string' },  // YYYY-MM
      { name: 'categoria', required: true, type: 'string' },
      { name: 'concepto',  required: true, type: 'string' },
      { name: 'monto',     required: true, type: 'number' },
    ],
  },
}

// ─── Result types ─────────────────────────────────────────────────────────────

export interface ValidationError {
  row:      number
  column:   string
  found:    string
  expected: string
}

export interface ValidationResult {
  ok:             boolean
  step:           string
  error?:         string
  warnings:       string[]
  dataErrors:     ValidationError[]
  rows:           Record<string, unknown>[]
  headers:        string[]
  extraColumns:   string[]
  missingColumns: string[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Normalizes an Excel header to a schema-safe key:
//   trim → strip accents → lowercase → spaces to underscores
// "Tipo Zona" → "tipo_zona"  |  "Año Caja" → "ano_caja"  |  "Promoción" → "promocion"
function normalizeHeader(h: string): string {
  return h
    .trim()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')  // strip diacritics (á→a, ñ→n, etc.)
    .toLowerCase()
    .replace(/\s+/g, '_')
}

// Parses a date string accepting both YYYY-MM-DD and DD/MM/YYYY.
// Returns a valid Date or null.
function parseDate(val: string): Date | null {
  // DD/MM/YYYY  (Excel argentino / español)
  const ddmm = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(val)
  if (ddmm) {
    const d = new Date(`${ddmm[3]}-${ddmm[2].padStart(2, '0')}-${ddmm[1].padStart(2, '0')}`)
    return isNaN(d.getTime()) ? null : d
  }
  // YYYY-MM-DD o cualquier formato que JS reconozca nativamente
  const d = new Date(val)
  return isNaN(d.getTime()) ? null : d
}

// ─── Main validator ───────────────────────────────────────────────────────────

export function validateFile(file: File, tableType: TableType): Promise<ValidationResult> {
  return new Promise(resolve => {
    const schema  = TABLE_SCHEMAS[tableType]
    const required = schema.columns.filter(c => c.required).map(c => c.name)
    const allCols  = schema.columns.map(c => c.name)
    const warnings: string[] = []

    // Step 1 — format
    const ext = file.name.split('.').pop()?.toLowerCase()
    if (ext !== 'xlsx' && ext !== 'csv') {
      return resolve({
        ok: false, step: 'formato', warnings, rows: [], headers: [],
        extraColumns: [], missingColumns: [],
        error: 'Solo se aceptan archivos .xlsx o .csv',
        dataErrors: [],
      })
    }

    const reader = new FileReader()
    reader.onload = e => {
      try {
        const data     = new Uint8Array(e.target!.result as ArrayBuffer)
        const workbook = XLSX.read(data, { type: 'array', cellDates: true })
        const sheet    = workbook.Sheets[workbook.SheetNames[0]]
        const rawRows  = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
          defval: '', raw: false, dateNF: 'yyyy-mm-dd',
        })

        if (rawRows.length === 0) {
          return resolve({
            ok: false, step: 'formato', warnings, rows: [], headers: [],
            extraColumns: [], missingColumns: [],
            error: 'El archivo no contiene filas de datos',
            dataErrors: [],
          })
        }

        // Step 2 — columns
        const headers        = Object.keys(rawRows[0]).map(normalizeHeader)
        const normalizedRows = rawRows.map(r =>
          Object.fromEntries(Object.entries(r).map(([k, v]) => [normalizeHeader(k), v]))
        )

        const missingColumns = required.filter(c => !headers.includes(c))
        const extraColumns   = headers.filter(c => !allCols.includes(c))

        if (missingColumns.length > 0) {
          return resolve({
            ok: false, step: 'columnas', warnings, rows: normalizedRows, headers,
            extraColumns, missingColumns,
            error: `Faltan estas columnas: ${missingColumns.join(', ')}.\nEl archivo debe tener exactamente estas columnas: ${required.join(', ')}`,
            dataErrors: [],
          })
        }

        if (extraColumns.length > 0) {
          warnings.push(`Se ignorarán estas columnas no reconocidas: ${extraColumns.join(', ')}`)
        }

        // Step 3 — data types
        const dataErrors: ValidationError[] = []
        const MAX_ERRORS = 20

        for (let i = 0; i < normalizedRows.length && dataErrors.length < MAX_ERRORS + 1; i++) {
          const row = normalizedRows[i]
          const rowNum = i + 2  // 1-indexed + header row

          // Check completely empty rows
          const vals = Object.values(row).filter(v => v !== '' && v !== null && v !== undefined)
          if (vals.length === 0) continue  // skip silently

          for (const col of schema.columns) {
            if (!headers.includes(col.name)) continue
            const val = row[col.name]

            if (col.required && (val === '' || val === null || val === undefined)) {
              dataErrors.push({ row: rowNum, column: col.name, found: String(val), expected: 'valor requerido' })
              continue
            }
            if (val === '' || val === null || val === undefined) continue

            if (col.type === 'number') {
              const num = Number(String(val).replace(',', '.').replace(/\s/g, ''))
              if (isNaN(num)) {
                dataErrors.push({ row: rowNum, column: col.name, found: String(val), expected: 'número' })
              }
            } else if (col.type === 'date') {
              if (parseDate(String(val)) === null) {
                dataErrors.push({ row: rowNum, column: col.name, found: String(val), expected: 'fecha (DD/MM/YYYY o YYYY-MM-DD)' })
              }
            }
          }
        }

        if (dataErrors.length > MAX_ERRORS) {
          const extra = dataErrors.length - MAX_ERRORS
          dataErrors.splice(MAX_ERRORS)
          warnings.push(`y ${extra} errores más no mostrados`)
        }

        if (dataErrors.length > 0) {
          return resolve({
            ok: false, step: 'datos', warnings, rows: normalizedRows, headers,
            extraColumns, missingColumns: [],
            error: `Se encontraron ${dataErrors.length} errores en los datos`,
            dataErrors,
          })
        }

        resolve({
          ok: true, step: 'ok', warnings, rows: normalizedRows, headers,
          extraColumns, missingColumns: [],
          dataErrors: [],
        })
      } catch (err: unknown) {
        resolve({
          ok: false, step: 'formato', warnings, rows: [], headers: [],
          extraColumns: [], missingColumns: [],
          error: `No se pudo leer el archivo: ${err instanceof Error ? err.message : String(err)}`,
          dataErrors: [],
        })
      }
    }
    reader.readAsArrayBuffer(file)
  })
}
