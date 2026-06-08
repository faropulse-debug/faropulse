export interface UploadErrorMessage {
  titulo:  string
  detalle: string
  tecnico: string
}

// Items-specific columns that shouldn't appear in a ventas file
const ITEMS_MARKER_COLS = ['descripcion', 'cantidad', 'precio_total', 'familia']
// Ventas-specific columns that shouldn't appear in an items file
const VENTAS_MARKER_COLS = ['total', 'comensales', 'tipo_documento']

function parseExtraCols(detail: string): string[] {
  const m = /Sobran columnas: \[([^\]]*)\]/.exec(detail)
  if (!m || !m[1].trim()) return []
  return m[1].split(',').map(s => s.trim()).filter(Boolean)
}

function parseMissingCols(detail: string): string {
  const m = /Faltan columnas requeridas: \[([^\]]*)\]/.exec(detail)
  return m ? m[1] : ''
}

export function translateUploadError(
  error: string,
  errors?: string[],
): UploadErrorMessage {
  const detail  = errors?.[0] ?? ''
  const tecnico = errors?.length ? `${error} — ${errors.join(' | ')}` : error

  if (error === 'VALIDATION_FAILED') {
    if (detail === 'Archivo no es Excel') {
      return {
        titulo:  'Ese archivo no parece un reporte de ventas',
        detalle: 'Revisá que sea el Excel que exporta el POS (.xlsx). Los PDFs e imágenes no son compatibles.',
        tecnico,
      }
    }

    if (detail === 'Excel vacío') {
      return {
        titulo:  'El archivo está vacío',
        detalle: 'El Excel no tiene filas de datos. Exportá el reporte de nuevo desde el POS y reintentá.',
        tecnico,
      }
    }

    if (detail.startsWith('Faltan columnas requeridas')) {
      const extras  = parseExtraCols(detail)
      const missing = parseMissingCols(detail)

      // Wrong file type detection
      if (ITEMS_MARKER_COLS.some(c => extras.includes(c))) {
        return {
          titulo:  'Parece un archivo de ítems, no de ventas',
          detalle: 'Subilo en la sección "Cargar Ítems".',
          tecnico,
        }
      }
      if (VENTAS_MARKER_COLS.some(c => extras.includes(c))) {
        return {
          titulo:  'Parece un archivo de ventas, no de ítems',
          detalle: 'Subilo en la sección "Cargar Ventas".',
          tecnico,
        }
      }

      return {
        titulo:  'Al archivo le faltan columnas',
        detalle: missing
          ? `Columnas faltantes: ${missing}. Revisá que sea el reporte correcto del POS.`
          : 'Revisá que el archivo sea el reporte correcto exportado desde el POS.',
        tecnico,
      }
    }

    // VALIDATION_FAILED con mensaje no reconocido
    return {
      titulo:  'El archivo no es válido',
      detalle: detail || 'Revisá que sea el Excel correcto exportado desde el POS.',
      tecnico,
    }
  }

  if (error === 'TOO_MANY_REJECTED') {
    return {
      titulo:  'Demasiadas filas con datos inválidos',
      detalle: 'Más del 5% de las filas no pudieron procesarse. Revisá que el archivo no esté corrupto o tenga el formato incorrecto.',
      tecnico,
    }
  }

  // Postgres / commit errors
  if (
    error.includes('commit_upload') ||
    error.includes('RPC failed') ||
    /\b(ERROR|FATAL|DETAIL)\b/.test(error)
  ) {
    return {
      titulo:  'Hubo un problema al guardar',
      detalle: 'Probá de nuevo; si sigue, puede haber un dato inválido en el archivo.',
      tecnico,
    }
  }

  // Route-level guard errors
  if (error === 'Faltan location_id u org_id') {
    return {
      titulo:  'Sesión no válida',
      detalle: 'Recargá la página e intentá de nuevo. Si el problema persiste, verificá que tu sesión esté activa.',
      tecnico,
    }
  }

  if (error.startsWith('Se requiere')) {
    return {
      titulo:  'Falta el archivo',
      detalle: 'Seleccioná el archivo antes de continuar.',
      tecnico,
    }
  }

  // HTTP status errors from fetch
  if (/^HTTP \d{3}$/.test(error)) {
    return {
      titulo:  'Error de comunicación',
      detalle: 'No se pudo conectar con el servidor. Probá de nuevo en unos segundos.',
      tecnico,
    }
  }

  // Fallback
  return {
    titulo:  'Algo salió mal',
    detalle: 'No pudimos procesar el archivo. Probá de nuevo; si sigue, verificá que el archivo sea el correcto.',
    tecnico: error,
  }
}
