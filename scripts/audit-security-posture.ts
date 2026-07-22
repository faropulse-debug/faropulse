import { fetchActualState } from './lib/supabase-api'
import { SECURITY_EXCEPTIONS } from './security-exceptions'
import { evaluateSecurityPosture } from './lib/security-engine'

const PROJECT_REF = process.env.PROJECT_REF
const SUPABASE_ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN

if (!PROJECT_REF || !SUPABASE_ACCESS_TOKEN) {
  console.error('❌ Faltan PROJECT_REF o SUPABASE_ACCESS_TOKEN')
  process.exit(1)
}

async function run() {
  console.log(`\n🔍 Obteniendo estado actual de Supabase (proyecto ${PROJECT_REF})...`)
  const actualState = await fetchActualState(PROJECT_REF as string, SUPABASE_ACCESS_TOKEN as string)

  console.log(`\n🛡️  Evaluando Postura de Seguridad...`)
  const { findings, passedExceptions } = evaluateSecurityPosture(actualState, SECURITY_EXCEPTIONS)

  // Reportar excepciones
  if (passedExceptions.length > 0) {
    console.log(`\n✅ ${passedExceptions.length} Excepciones Autorizadas:`)
    for (const p of passedExceptions) {
      console.log(`   - ${p.detail}`)
    }
  }

  const warnings = findings.filter(f => f.level === 'WARNING')
  if (warnings.length > 0) {
    console.log(`\n🟡 ${warnings.length} Hallazgos WARNING (Revisar):`)
    for (const w of warnings) {
      console.log(`   - [${w.rule}] ${w.table}${w.policyName ? ` (policy: ${w.policyName})` : ''}: ${w.detail}`)
    }
  }

  const criticals = findings.filter(f => f.level === 'CRITICAL' || f.level === 'ERROR')
  if (criticals.length > 0) {
    console.error(`\n❌ ${criticals.length} Hallazgos CRÍTICOS/ERRORES (Bloqueantes):`)
    for (const c of criticals) {
      console.error(`   - [${c.rule}] ${c.table}${c.policyName ? ` (policy: ${c.policyName})` : ''}: ${c.detail}`)
    }
    console.error('\n🚨 El pipeline falló debido a problemas de postura de seguridad. Debes corregirlos o declarar una excepción justificada en scripts/security-exceptions.ts.\n')
    process.exit(1)
  }

  console.log('\n🚀 Postura de seguridad validada correctamente. Sin hallazgos críticos.\n')
  process.exit(0)
}

run().catch(e => {
  console.error('Error Fatal:', e)
  process.exit(1)
})
