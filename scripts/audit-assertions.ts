import fs from 'fs'
import path from 'path'
import { analyzeAssertions, type AssertionFinding } from './lib/assertion-engine'

// Parse CLI arguments
const args = process.argv.slice(2)
let mode: 'ci' | 'report' = 'ci'

if (args.includes('--mode=report') || args.includes('--report')) {
  mode = 'report'
} else if (args.includes('--mode=ci') || args.includes('--ci') || args.includes('--check')) {
  mode = 'ci'
}

const targetDirs = ['tests', 'scripts']

function getFilesRecursively(dir: string): string[] {
  const fullPath = path.resolve(process.cwd(), dir)
  if (!fs.existsSync(fullPath)) return []

  const results: string[] = []
  const list = fs.readdirSync(fullPath, { withFileTypes: true })

  for (const item of list) {
    const itemPath = path.join(dir, item.name)
    if (item.isDirectory()) {
      if (item.name !== 'node_modules' && item.name !== '.git' && item.name !== '.system_generated') {
        results.push(...getFilesRecursively(itemPath))
      }
    } else if (item.name.endsWith('.ts') || item.name.endsWith('.js') || item.name.endsWith('.mjs')) {
      // Exclude the assertion engine and audit script itself to prevent self-matching
      if (!itemPath.includes('assertion-engine') && !itemPath.includes('audit-assertions')) {
        results.push(itemPath)
      }
    }
  }

  return results
}

export function runAssertionAudit(files: string[]): {
  totalFiles: number
  findings: AssertionFinding[]
} {
  const allFindings: AssertionFinding[] = []

  for (const file of files) {
    const filePath = path.resolve(process.cwd(), file)
    const content = fs.readFileSync(filePath, 'utf8')
    const fileFindings = analyzeAssertions(content, file, { integrationOnly: true })
    allFindings.push(...fileFindings)
  }

  return {
    totalFiles: files.length,
    findings: allFindings,
  }
}

async function main() {
  console.log(`\n🔍 Auditoría de Aserciones Frágiles (Modo: ${mode.toUpperCase()})\n`)

  const files = targetDirs.flatMap(getFilesRecursively)
  const { totalFiles, findings } = runAssertionAudit(files)

  console.log(`📁 Archivos escaneados: ${totalFiles}`)
  console.log(`🎯 Hallazgos detectados: ${findings.length}\n`)

  if (findings.length === 0) {
    console.log(`✅  Excelente: No se detectaron aserciones numéricas frágiles en los tests de integración.\n`)
    process.exit(0)
  }

  console.log(`⚠️  Aserciones frágiles detectadas:\n`)
  for (const f of findings) {
    console.log(`  ❌ ${f.file}:${f.line}:${f.column}`)
    console.log(`     Aserción: expect(${f.expression}).${f.matcher}(${f.literal})`)
    console.log(`     Sugerencia: ${f.suggestion}`)
    console.log('')
  }

  if (mode === 'ci') {
    console.error(`🚨 Falló la auditoría: Se encontraron ${findings.length} aserciones frágiles que deben ser corregidas para asegurar la estabilidad del CI.\n`)
    process.exit(1)
  } else {
    console.log(`ℹ️  Modo reporte: ${findings.length} aserciones reportadas sin bloquear.\n`)
    process.exit(0)
  }
}

if (require.main === module || (process.argv[1] && process.argv[1].includes('audit-assertions'))) {
  main().catch(err => {
    console.error('Error inesperado en audit-assertions:', err)
    process.exit(1)
  })
}
