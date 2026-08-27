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
    if (!Array.isArray(parsed) || parsed.length === 0) return null
    return parsed.map(s => s.name)
  } catch {
    return null
  }
}

export function runSecretsAudit(): {
  success: boolean
  missingSecrets: string[]
  referencedMap: Map<string, string[]>
  source: 'gh_cli' | 'environment'
} {
  const workflowMap = getWorkflowFiles('.github/workflows')
  const githubSecrets = fetchGitHubSecrets()

  if (githubSecrets !== null) {
    const parity = evaluateSecretsParity(workflowMap, githubSecrets)
    return {
      success: parity.missingSecrets.length === 0,
      missingSecrets: parity.missingSecrets,
      referencedMap: parity.referencedSecrets,
      source: 'gh_cli',
    }
  }

  // Fallback para CI (GITHUB_TOKEN sin scope de admin para gh secret list):
  // Valida que TODOS los secrets referenciados en los workflows existan y tengan valor no vacío en process.env.
  // En GitHub Actions, si un secret no existe en el repositorio, ${{ secrets.X }} se evalúa a string vacío "".
  const referencedMap = new Map<string, string[]>()

  for (const [filename, content] of workflowMap.entries()) {
    const secrets = extractReferencedSecrets(content)
    for (const s of secrets) {
      if (!referencedMap.has(s)) referencedMap.set(s, [])
      referencedMap.get(s)!.push(filename)
    }
  }

  const missingSecrets: string[] = []
  for (const secretName of referencedMap.keys()) {
    const val = process.env[secretName]
    // Si la variable no existe en el entorno o es string vacío "" -> el secret NO está cargado
    if (!val || val.trim() === '') {
      missingSecrets.push(secretName)
    }
  }

  return {
    success: missingSecrets.length === 0,
    missingSecrets: missingSecrets.sort(),
    referencedMap,
    source: 'environment',
  }
}

async function main() {
  console.log(`\n🔐 Auditoría de Secrets de CI (Workflow vs GitHub Repository)\n`)

  const result = runSecretsAudit()

  if (result.source === 'gh_cli') {
    console.log(`📡 Fuente de verificación: GitHub CLI (\`gh secret list\`)`)
  } else {
    console.log(`📡 Fuente de verificación: Variables de entorno inyectadas en CI (evaluación de \${{ secrets.* }})`)
  }

  console.log(`📋 Secrets únicos referenciados en workflows: ${result.referencedMap.size}\n`)

  for (const [secName, files] of result.referencedMap.entries()) {
    const isMissing = result.missingSecrets.includes(secName)
    const icon = isMissing ? '❌' : '✅'
    console.log(`  ${icon} ${secName.padEnd(36)} (usado en: ${files.join(', ')})`)
  }

  console.log('')

  if (!result.success) {
    console.error(`🚨 ERROR: Faltan ${result.missingSecrets.length} secrets requeridos por los workflows:`)
    for (const m of result.missingSecrets) {
      console.error(`   - ${m} (referenciado en: ${result.referencedMap.get(m)?.join(', ')})`)
    }
    console.error(`\n💡 Para agregarlos en GitHub, ejecuta: gh secret set <NOMBRE_DEL_SECRET>\n`)
    process.exit(1)
  }

  console.log(`✅  Todos los secrets referenciados en los workflows existen y tienen valor válido.\n`)
  process.exit(0)
}

if (require.main === module || (process.argv[1] && process.argv[1].includes('audit-secrets'))) {
  main().catch(err => {
    console.error('Error fatal en audit-secrets:', err)
    process.exit(1)
  })
}
