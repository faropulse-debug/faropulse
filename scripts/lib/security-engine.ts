import type { ActualTable } from './supabase-api'
import type { SecurityException, SecurityRule } from '../security-exceptions'

export type SecurityLevel = 'CRITICAL' | 'ERROR' | 'WARNING'

export type Finding = {
  level: SecurityLevel
  rule: SecurityRule
  table: string
  policyName?: string
  detail: string
}

export type PassedException = {
  exception: SecurityException
  detail: string
}

export function evaluateSecurityPosture(
  tables: Record<string, ActualTable>,
  exceptions: SecurityException[]
): {
  findings: Finding[]
  passedExceptions: PassedException[]
} {
  const findings: Finding[] = []
  const passedExceptions: PassedException[] = []

  function addFinding(
    level: SecurityLevel,
    rule: SecurityRule,
    table: string,
    detail: string,
    policyName?: string,
    roles?: string[]
  ) {
    const isException = exceptions.find(e => {
      if (e.table !== table || e.rule !== rule) return false
      if (e.policyName && e.policyName !== policyName) return false
      if (e.expectedRoles) {
        if (!roles) return false
        if (e.expectedRoles.length !== roles.length) return false
        const sortedExpected = [...e.expectedRoles].sort()
        const sortedActual = [...roles].sort()
        for (let i = 0; i < sortedExpected.length; i++) {
          if (sortedExpected[i] !== sortedActual[i]) return false
        }
      }
      return true
    })

    if (isException) {
      passedExceptions.push({
        exception: isException,
        detail: `[EXCEPCION ACEPTADA] ${detail} (Motivo: ${isException.reason})`
      })
    } else {
      findings.push({ level, rule, table, policyName, detail })
    }
  }

  for (const table of Object.values(tables)) {
    if (!table.rls) {
      addFinding('CRITICAL', 'RLS_OFF', table.name, 'Tabla con RLS apagado')
    } else if (table.policies.length === 0) {
      addFinding('ERROR', 'NO_POLICIES', table.name, 'Tabla con RLS encendido pero sin políticas')
    }

    for (const policy of table.policies) {
      const isUsingTrue = policy.qual === 'true' || policy.with_check === 'true'
      
      if (isUsingTrue) {
        if (policy.roles.length === 1 && policy.roles[0] === 'service_role') {
          // Si roles es EXCLUSIVAMENTE service_role, no es crítico
        } else {
          addFinding('CRITICAL', 'USING_TRUE', table.name, `Política expone datos sin filtro (USING/WITH CHECK = true)`, policy.name, policy.roles)
        }
      }

      const hasAnon = policy.roles.includes('anon')
      const hasPublic = policy.roles.includes('public')

      if (hasAnon) {
        addFinding('CRITICAL', 'ANON_PUBLIC_ROLE', table.name, `Política expuesta a rol 'anon'`, policy.name, policy.roles)
      } else if (hasPublic) {
        if (isUsingTrue) {
          addFinding('CRITICAL', 'ANON_PUBLIC_ROLE', table.name, `Política asignada a rol 'public' sin filtro restrictivo`, policy.name, policy.roles)
        } else {
          addFinding('WARNING', 'ANON_PUBLIC_ROLE', table.name, `Política asignada a rol 'public' con filtro efectivo`, policy.name, policy.roles)
        }
      }
    }
  }

  return { findings, passedExceptions }
}
