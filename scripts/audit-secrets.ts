import fs from 'fs'
import path from 'path'
import { execSync } from 'child_process'
import { evaluateSecretsParity, extractReferencedSecrets } from './lib/secrets-engine'

function getWorkflowFiles(dir: string): Map<string, string> {
  const fullPath = path.resolve(process.cwd(), dir)
  const map = new Map<string, string>()
  if (!fs.existsSync(fullPath)) return map

  const files = fs.readdirSync(fullPath).filter(f => f.endsWith('.yml') || f.endsWith('.yaml'))
  for (const f of files) {
    map.set(f, fs.readFileSync(path.join(fullPath, f), 'utf8'))
  }
  return map
}

function fetchGitHubSecrets(): string[] | null {
  try {
    const raw = execSync('gh secret list --json name', {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore'],
    })
    const parsed = JSON.parse(raw) as Array<{ name: string }>
    return parsed.map(s => s.name)
  } catch {
    return null
  }
}

export function runSecretsAudit(): {
  success: boolean
  missingSecrets: string[]
  referencedMap: Map<string, string[]>
} {
  const workflowMap = getWorkflowFiles('.github/workflows')
  const githubSecrets = fetchGitHubSecrets()

  if (githubSecrets !== null) {
    const parity = evaluateSecretsParity(workflowMap, githubSecrets)
    return {
      success: parity.missingSecrets.length === 0,
      missingSecrets: parity.missingSecrets,
      referencedMap: parity.referencedSecrets,
    }
  }

  // Fallback para runners de CI donde gh secret list no tenga permisos de lectura API:
  // Valida que las variables de entorno inyectadas desde secrets.* no estén vacías.
  const allReferenced = new Set<string>()
  const referencedMap = new Map<string, string[]>()

  for (const [filename, content] of workflowMap.entries()) {
    const secrets = extractReferencedSecrets(content)
    for (const s of secrets) {
      allReferenced.add(s)
      if (!referencedMap.has(s)) referencedMap.set(s, [])
      referencedMap.get(s)!.push(filename)
    }
  }

  // Si estamos en CI y se pasaron variables de entorno, verificar las que están definidas en process.env
  const missingInEnv: string[] = []
  for (const secretName of allReferenced) {
    // Si la variable está definida en process.env pero tiene valor vacío "" -> indica secret no existente en GitHub
    if (secretName in process.env && process.env[secretName] === '') {
      missingInEnv.push(secretName)
    }
  }

  return {
    success: missingInEnv.length === 0,
    missingSecrets: missingInEnv,
    referencedMap,
  }
}

async function main() {
  console.log(`\n🔐 Auditoría de Secrets de CI (Workflow vs GitHub Repository)\n`)

  const workflowMap = getWorkflowFiles('.github/workflows')
  const githubSecrets = fetchGitHubSecrets()

  if (githubSecrets === null) {
    console.log(`ℹ️  gh CLI no disponible o sin permisos de API directa. Evaluando entorno de ejecución...`)
  } else {
    console.log(`📡 GitHub Secrets detectados en el repo: ${githubSecrets.length}`)
  }

  const result = runSecretsAudit()

  console.log(`📋 Secrets únicos referenciados en workflows: ${result.referencedMap.size}\n`)

  for (const [secName, files] of result.referencedMap.entries()) {
    const isMissing = result.missingSecrets.includes(secName)
    const icon = isMissing ? '❌' : '✅'
    console.log(`  ${icon} ${secName.padEnd(36)} (usado en: ${files.join(', ')})`)
  }

  console.log('')

  if (!result.success) {
    console.error(`🚨 ERROR: Faltan ${result.missingSecrets.length} secrets requeridos por los workflows en GitHub:`)
    for (const m of result.missingSecrets) {
      console.error(`   - ${m} (referenciado en: ${result.referencedMap.get(m)?.join(', ')})`)
    }
    console.error(`\n💡 Para agregarlos, ejecuta: gh secret set <NOMBRE_DEL_SECRET>\n`)
    process.exit(1)
  }

  console.log(`✅  Todos los secrets referenciados en los workflows de CI existen en GitHub.\n`)
  process.exit(0)
}

if (require.main === module || (process.argv[1] && process.argv[1].includes('audit-secrets'))) {
  main().catch(err => {
    console.error('Error fatal en audit-secrets:', err)
    process.exit(1)
  })
}
