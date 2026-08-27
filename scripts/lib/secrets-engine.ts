/**
 * scripts/lib/secrets-engine.ts
 * Motor puro para extraer y comparar los secrets referenciados en GitHub Actions workflows
 * contra los secrets provisionados en el repositorio.
 */

export interface SecretAuditResult {
  referencedSecrets: Map<string, string[]> // secretName -> workflow files referencing it
  missingSecrets: string[]
  existingSecrets: string[]
}

/**
 * Secrets built-in de GitHub Actions que no requieren ser creados en el repositorio.
 */
export const BUILTIN_GITHUB_SECRETS: ReadonlySet<string> = new Set([
  'GITHUB_TOKEN',
])

/**
 * Extrae todos los nombres de secrets referenciados en un string de workflow YAML.
 * Detecta patrones de expresiones de GitHub Actions como ${{ secrets.NOMBRE_SECRET }} o secrets.NOMBRE_SECRET en ifs.
 * Evita falsos positivos con extensiones de archivo (ej. audit-secrets.ts).
 */
export function extractReferencedSecrets(workflowYaml: string): string[] {
  // Matchea:
  // 1. ${{ ... secrets.NOMBRE ... }}
  // 2. if: ... secrets.NOMBRE ...
  const regex = /\$\{\{\s*[^}]*?\bsecrets\.([A-Za-z0-9_]+)\b[^}]*?\}\}|\bif:\s*.*?\bsecrets\.([A-Za-z0-9_]+)\b/g
  const found = new Set<string>()

  let match: RegExpExecArray | null
  while ((match = regex.exec(workflowYaml)) !== null) {
    const name = match[1] || match[2]
    if (name && !BUILTIN_GITHUB_SECRETS.has(name)) {
      found.add(name)
    }
  }

  return Array.from(found).sort()
}

/**
 * Compara los secrets referenciados en workflows contra los secrets existentes.
 */
export function evaluateSecretsParity(
  referencedByFile: Map<string, string>, // filename -> yaml content
  existingSecretNames: string[]
): SecretAuditResult {
  const existingSet = new Set(existingSecretNames)
  const referencedMap = new Map<string, string[]>()

  for (const [filename, content] of referencedByFile.entries()) {
    const secretsInFile = extractReferencedSecrets(content)
    for (const secretName of secretsInFile) {
      if (!referencedMap.has(secretName)) {
        referencedMap.set(secretName, [])
      }
      referencedMap.get(secretName)!.push(filename)
    }
  }

  const missingSecrets: string[] = []
  for (const secretName of referencedMap.keys()) {
    if (!existingSet.has(secretName)) {
      missingSecrets.push(secretName)
    }
  }

  return {
    referencedSecrets: referencedMap,
    missingSecrets: missingSecrets.sort(),
    existingSecrets: Array.from(existingSet).sort(),
  }
}
