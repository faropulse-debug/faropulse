import type { SchemaState, TableSchema, FunctionSchema } from './supabase-api'

export type DiffMode = 'ci' | 'pre-deploy' | 'post-apply'
export type Severity = 'CRITICAL' | 'ERROR' | 'INFO' | 'WARNING'
export type DiffType = 'DRIFT' | 'MISMATCH' | 'MISSING'

export type SchemaFinding = {
  level: Severity
  type: DiffType
  objectType: 'TABLE' | 'COLUMN' | 'CONSTRAINT' | 'INDEX' | 'FUNCTION'
  objectName: string
  detail: string
}

export const CRITICAL_FUNCTIONS = [
  'user_has_membership'
]

// Exclude these tables from diff entirely
const IGNORED_TABLES = [
  'schema_migrations' // Managed by Drizzle/Supabase migrator
]

export function normalizeSqlBody(body: string): string {
  // 1. Remove single-line comments (-- comment)
  let normalized = body.replace(/--.*$/gm, '')
  // 2. Remove multi-line comments (/* comment */)
  normalized = normalized.replace(/\/\*[\s\S]*?\*\//g, '')
  // 3. Normalize whitespace (tabs, newlines, multiple spaces -> single space)
  normalized = normalized.replace(/\s+/g, ' ')
  // 4. Trim leading/trailing
  return normalized.trim()
}

export function validateShadowFreshness(localSqlVersions: string[], appliedMigrations: string[]): void {
  const missing = localSqlVersions.filter(f => !appliedMigrations.includes(f))
  if (missing.length > 0) {
    throw new Error(`[SALVAGUARDA] Shadow DB desactualizada. Faltan ${missing.length} migraciones (ej. ${missing[0]}).`)
  }
}

export function evaluateSchemaDiff(
  expected: SchemaState,
  actual: SchemaState,
  mode: DiffMode
): SchemaFinding[] {
  const findings: SchemaFinding[] = []

  // Helper to determine MISSING level based on mode
  const missingLevel = mode === 'post-apply' ? 'ERROR' : 'INFO'

  // 1. Check Tables
  const expectedTableNames = Object.keys(expected.tables).filter(t => !IGNORED_TABLES.includes(t))
  const actualTableNames = Object.keys(actual.tables).filter(t => !IGNORED_TABLES.includes(t))

  // DRIFT in tables (Exists in Actual, not in Expected)
  for (const actualName of actualTableNames) {
    if (!expectedTableNames.includes(actualName)) {
      findings.push({
        level: 'CRITICAL',
        type: 'DRIFT',
        objectType: 'TABLE',
        objectName: actualName,
        detail: `Tabla extra en el entorno que no existe en el repositorio.`
      })
    }
  }

  // Compare common tables + MISSING tables
  for (const expectedName of expectedTableNames) {
    const expectedTable = expected.tables[expectedName]
    const actualTable = actual.tables[expectedName]

    if (!actualTable) {
      findings.push({
        level: missingLevel,
        type: 'MISSING',
        objectType: 'TABLE',
        objectName: expectedName,
        detail: `Tabla esperada no encontrada en el entorno.`
      })
      continue
    }

    // Compare Columns
    const expectedCols = Object.keys(expectedTable.columns)
    const actualCols = Object.keys(actualTable.columns)

    // DRIFT Columns
    for (const actCol of actualCols) {
      if (!expectedCols.includes(actCol)) {
        findings.push({
          level: 'CRITICAL',
          type: 'DRIFT',
          objectType: 'COLUMN',
          objectName: `${expectedName}.${actCol}`,
          detail: `Columna extra en el entorno.`
        })
      }
    }

    // MISSING & MISMATCH Columns
    for (const expCol of expectedCols) {
      const eCol = expectedTable.columns[expCol]
      const aCol = actualTable.columns[expCol]

      if (!aCol) {
        findings.push({
          level: missingLevel,
          type: 'MISSING',
          objectType: 'COLUMN',
          objectName: `${expectedName}.${expCol}`,
          detail: `Columna esperada no encontrada.`
        })
      } else {
        if (eCol.type !== aCol.type) {
          findings.push({
            level: 'ERROR',
            type: 'MISMATCH',
            objectType: 'COLUMN',
            objectName: `${expectedName}.${expCol}`,
            detail: `Tipo distinto. Esperado: ${eCol.type}, Real: ${aCol.type}`
          })
        }
        if (eCol.nullable !== aCol.nullable) {
          findings.push({
            level: 'ERROR',
            type: 'MISMATCH',
            objectType: 'COLUMN',
            objectName: `${expectedName}.${expCol}`,
            detail: `Nulabilidad distinta. Esperado: nullable=${eCol.nullable}, Real: nullable=${aCol.nullable}`
          })
        }
      }
    }

    // Compare Constraints
    const expectedConstraints = Object.keys(expectedTable.constraints)
    const actualConstraints = Object.keys(actualTable.constraints)

    // DRIFT Constraints
    for (const actCons of actualConstraints) {
      if (!expectedConstraints.includes(actCons)) {
        findings.push({
          level: 'CRITICAL',
          type: 'DRIFT',
          objectType: 'CONSTRAINT',
          objectName: `${expectedName}.${actCons}`,
          detail: `Constraint extra en el entorno.`
        })
      }
    }

    // MISSING & MISMATCH Constraints
    for (const expCons of expectedConstraints) {
      const eCons = expectedTable.constraints[expCons]
      const aCons = actualTable.constraints[expCons]

      if (!aCons) {
        findings.push({
          level: missingLevel,
          type: 'MISSING',
          objectType: 'CONSTRAINT',
          objectName: `${expectedName}.${expCons}`,
          detail: `Constraint esperado no encontrado.`
        })
      } else {
        // Normalize whitespace in constraint definitions for reliable compare
        if (normalizeSqlBody(eCons.def) !== normalizeSqlBody(aCons.def)) {
          findings.push({
            level: 'ERROR',
            type: 'MISMATCH',
            objectType: 'CONSTRAINT',
            objectName: `${expectedName}.${expCons}`,
            detail: `Definición divergente. Esperado: ${eCons.def} | Real: ${aCons.def}`
          })
        }
      }
    }

    // Compare Indices
    const expectedIndices = Object.keys(expectedTable.indices)
    const actualIndices = Object.keys(actualTable.indices)

    // DRIFT Indices
    for (const actIdx of actualIndices) {
      if (!expectedIndices.includes(actIdx)) {
        findings.push({
          level: 'WARNING', // Indices are less critical but still drift
          type: 'DRIFT',
          objectType: 'INDEX',
          objectName: `${expectedName}.${actIdx}`,
          detail: `Índice extra en el entorno.`
        })
      }
    }

    // MISSING & MISMATCH Indices
    for (const expIdx of expectedIndices) {
      const eIdx = expectedTable.indices[expIdx]
      const aIdx = actualTable.indices[expIdx]

      if (!aIdx) {
        findings.push({
          level: missingLevel,
          type: 'MISSING',
          objectType: 'INDEX',
          objectName: `${expectedName}.${expIdx}`,
          detail: `Índice esperado no encontrado.`
        })
      } else {
        if (normalizeSqlBody(eIdx.def) !== normalizeSqlBody(aIdx.def)) {
          findings.push({
            level: 'ERROR',
            type: 'MISMATCH',
            objectType: 'INDEX',
            objectName: `${expectedName}.${expIdx}`,
            detail: `Definición de índice divergente.`
          })
        }
      }
    }
  }

  // 2. Check Functions
  const expectedFunctions = Object.keys(expected.functions)
  const actualFunctions = Object.keys(actual.functions)

  // DRIFT Functions
  for (const actFunc of actualFunctions) {
    if (!expectedFunctions.includes(actFunc)) {
      findings.push({
        level: 'CRITICAL',
        type: 'DRIFT',
        objectType: 'FUNCTION',
        objectName: actFunc,
        detail: `Función extra en el entorno.`
      })
    }
  }

  // MISSING & MISMATCH Functions
  for (const expFunc of expectedFunctions) {
    const eFunc = expected.functions[expFunc]
    const aFunc = actual.functions[expFunc]

    if (!aFunc) {
      findings.push({
        level: missingLevel,
        type: 'MISSING',
        objectType: 'FUNCTION',
        objectName: expFunc,
        detail: `Función esperada no encontrada.`
      })
    } else {
      // Return type mismatch
      if (eFunc.return_type !== aFunc.return_type) {
        findings.push({
          level: 'ERROR',
          type: 'MISMATCH',
          objectType: 'FUNCTION',
          objectName: expFunc,
          detail: `Retorno distinto. Esperado: ${eFunc.return_type} | Real: ${aFunc.return_type}`
        })
      }

      // Body mismatch (only for RLS-critical functions)
      if (CRITICAL_FUNCTIONS.includes(eFunc.name)) {
        const eBody = normalizeSqlBody(eFunc.body)
        const aBody = normalizeSqlBody(aFunc.body)
        if (eBody !== aBody) {
          findings.push({
            level: 'ERROR', // This is extremely critical because RLS fails silently
            type: 'MISMATCH',
            objectType: 'FUNCTION',
            objectName: expFunc,
            detail: `El cuerpo de la función RLS-crítica ha sido alterado manualmente.`
          })
        }
      }
    }
  }

  return findings
}
