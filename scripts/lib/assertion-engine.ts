import ts from 'typescript'

export interface AssertionFinding {
  file: string
  line: number
  column: number
  literal: number
  matcher: string
  expression: string
  rule: 'NO_BRITTLE_NUMERIC_ASSERTION'
  message: string
  suggestion: string
}

export interface AssertionLintOptions {
  /**
   * When true, only inspects files that perform live integration calls (e.g. Supabase DB / HTTP fetch against live env).
   * Files that are purely unit tests with local in-memory fixtures are skipped.
   * Defaults to true.
   */
  integrationOnly?: boolean
}

/**
 * Common HTTP status codes allowed in assertions.
 */
export const ALLOWED_HTTP_STATUS_CODES: ReadonlySet<number> = new Set([
  200, 201, 202, 204,
  301, 302, 304, 307, 308,
  400, 401, 403, 404, 405, 409, 422, 429,
  500, 501, 502, 503, 504
])

/**
 * Structural and boundary invariant constants (e.g. empty counts, unit signs).
 */
export const ALLOWED_INVARIANT_CONSTANTS: ReadonlySet<number> = new Set([
  0,   // Empty array length, zero diff, zero count
  1,   // Single item, boolean flag mapped to 1, documento_peso positive
  -1,  // documento_peso negative, not found index
])

/**
 * Deliberate synthetic test markers (stable fixture tokens planted in STG/DB for verification).
 * These are deliberate canary/synthetic values that do not change when normal live data accumulates.
 */
export const ALLOWED_SYNTHETIC_MARKERS: ReadonlySet<number> = new Set([
  555555.55,  // QA Tenant B synthetic total 1
  666666.66,  // QA Tenant B synthetic total 2
  777777.77,  // QA Tenant B synthetic total 3
  888888.88,  // Canario C-01 (financial_results Norte)
  1999999.98, // QA Tenant B aggregate sum (555555.55 + 666666.66 + 777777.77)
])

/**
 * Equality matchers checked by the linter.
 */
const EQUALITY_MATCHERS: ReadonlySet<string> = new Set([
  'toBe',
  'toEqual',
  'toStrictEqual',
])

/**
 * Detects whether a file represents an integration test with live DB / network interactions
 * (vs a pure unit test with in-memory fixtures or fully mocked clients).
 */
export function isLiveIntegrationTest(sourceCode: string, fileName: string): boolean {
  // If explicitly flagged with integration env variable or describe.runIf
  if (sourceCode.includes('RUN_INTEGRATION_TESTS') || sourceCode.includes('describe.runIf')) {
    return true
  }

  // Scripts that run live database verification (e.g. regression-test.ts, verify-*.ts)
  if (fileName.includes('scripts/') || fileName.includes('scripts\\')) {
    if (sourceCode.includes('supabase.com') || sourceCode.includes('createClient') || sourceCode.includes('sql(') || sourceCode.includes('rpc(')) {
      return true
    }
  }

  // If Supabase is mocked via vi.mock, it's a mocked unit test, NOT live DB
  if (sourceCode.includes("vi.mock('@supabase/supabase-js'") || sourceCode.includes('vi.mock("@supabase/supabase-js"')) {
    return false
  }

  // If it creates a real Supabase client or makes unmocked database/fetch calls
  if (sourceCode.includes('createClient(') || sourceCode.includes('fetchActualState') || sourceCode.includes('fetchSchemaState')) {
    return true
  }

  return false
}

/**
 * Checks if a numeric literal is allowed (HTTP status, invariant 0/1/-1, or synthetic marker).
 */
export function isAllowedNumericLiteral(num: number): boolean {
  if (ALLOWED_HTTP_STATUS_CODES.has(num)) return true
  if (ALLOWED_INVARIANT_CONSTANTS.has(num)) return true
  if (ALLOWED_SYNTHETIC_MARKERS.has(num)) return true
  return false
}

/**
 * Pure engine: Analyzes a TypeScript/JavaScript source file and returns any brittle numeric assertions.
 */
export function analyzeAssertions(
  sourceCode: string,
  fileName: string,
  options: AssertionLintOptions = { integrationOnly: true }
): AssertionFinding[] {
  const integrationOnly = options.integrationOnly !== false
  if (integrationOnly && !isLiveIntegrationTest(sourceCode, fileName)) {
    return []
  }

  const sourceFile = ts.createSourceFile(
    fileName,
    sourceCode,
    ts.ScriptTarget.Latest,
    true
  )

  const findings: AssertionFinding[] = []

  function visit(node: ts.Node) {
    // 1. Pattern: expect(expr).toBe(NUMBER) / .toEqual(NUMBER) / .toStrictEqual(NUMBER)
    if (ts.isCallExpression(node)) {
      const expr = node.expression
      if (ts.isPropertyAccessExpression(expr)) {
        const methodName = expr.name.text
        if (EQUALITY_MATCHERS.has(methodName) && node.arguments.length >= 1) {
          const expectedArg = node.arguments[0]

          // Check if expectedArg is a numeric literal or unary numeric literal (e.g. -1, 410, 363.5)
          const numValue = extractNumericValue(expectedArg)
          if (numValue !== null) {
            if (!isAllowedNumericLiteral(numValue)) {
              // Extract the target expression inside expect(...)
              const parentExpect = expr.expression
              let targetExprStr = 'expression'
              if (ts.isCallExpression(parentExpect) && parentExpect.arguments.length > 0) {
                targetExprStr = parentExpect.arguments[0].getText(sourceFile)
              }

              const { line, character } = sourceFile.getLineAndCharacterOfPosition(expectedArg.getStart(sourceFile))

              findings.push({
                file: fileName,
                line: line + 1,
                column: character + 1,
                literal: numValue,
                matcher: methodName,
                expression: targetExprStr,
                rule: 'NO_BRITTLE_NUMERIC_ASSERTION',
                message: `Comparación frágil contra el literal numérico fijo (${numValue}) sobre datos vivos.`,
                suggestion: `Reemplazá la comparación fija por un invariante relacional (ej. toBeGreaterThan(0), o compará contra el resultado de otra query en el mismo test).`
              })
            }
          }
        }
      }

      // 2. Pattern: assert(expr === NUMBER) or assert(expr == NUMBER)
      if (ts.isIdentifier(expr) && (expr.text === 'assert' || expr.text === 'expect')) {
        if (node.arguments.length > 0) {
          const firstArg = node.arguments[0]
          if (ts.isBinaryExpression(firstArg)) {
            const op = firstArg.operatorToken.kind
            if (op === ts.SyntaxKind.EqualsEqualsEqualsToken || op === ts.SyntaxKind.EqualsEqualsToken) {
              const leftNum = extractNumericValue(firstArg.left)
              const rightNum = extractNumericValue(firstArg.right)
              const numValue = rightNum !== null ? rightNum : leftNum

              if (numValue !== null && !isAllowedNumericLiteral(numValue)) {
                const targetNode = rightNum !== null ? firstArg.left : firstArg.right
                const targetExprStr = targetNode.getText(sourceFile)
                const { line, character } = sourceFile.getLineAndCharacterOfPosition(firstArg.getStart(sourceFile))

                findings.push({
                  file: fileName,
                  line: line + 1,
                  column: character + 1,
                  literal: numValue,
                  matcher: '===',
                  expression: targetExprStr,
                  rule: 'NO_BRITTLE_NUMERIC_ASSERTION',
                  message: `Comparación frágil (assert === ${numValue}) sobre datos vivos.`,
                  suggestion: `Reemplazá la comparación fija por un invariante relacional (ej. assert(${targetExprStr} > 0) o validación contra otra query).`
                })
              }
            }
          }
        }
      }
    }

    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
  return findings
}

/**
 * Extracts numeric value from a node if it is a NumericLiteral or PrefixUnaryExpression (negative number).
 */
function extractNumericValue(node: ts.Node): number | null {
  if (ts.isNumericLiteral(node)) {
    return parseFloat(node.text.replace(/_/g, ''))
  }
  if (ts.isPrefixUnaryExpression(node)) {
    if (node.operator === ts.SyntaxKind.MinusToken && ts.isNumericLiteral(node.operand)) {
      return -parseFloat(node.operand.text.replace(/_/g, ''))
    }
    if (node.operator === ts.SyntaxKind.PlusToken && ts.isNumericLiteral(node.operand)) {
      return parseFloat(node.operand.text.replace(/_/g, ''))
    }
  }
  return null
}
