import { describe, it, expect } from 'vitest'
import { evaluateSecurityPosture } from '../scripts/lib/security-engine'
import type { ActualTable } from '../scripts/lib/supabase-api'
import type { SecurityException } from '../scripts/security-exceptions'

describe('Security Engine', () => {
  it('debe fallar si RLS está apagado y no hay excepción', () => {
    const tables: Record<string, ActualTable> = {
      mi_tabla: { name: 'mi_tabla', rls: false, policies: [] }
    }
    const { findings, passedExceptions } = evaluateSecurityPosture(tables, [])
    expect(findings).toHaveLength(1)
    expect(findings[0].rule).toBe('RLS_OFF')
    expect(findings[0].level).toBe('CRITICAL')
    expect(passedExceptions).toHaveLength(0)
  })

  it('debe pasar si RLS está apagado pero HAY excepción', () => {
    const tables: Record<string, ActualTable> = {
      mi_tabla: { name: 'mi_tabla', rls: false, policies: [] }
    }
    const exceptions: SecurityException[] = [
      { table: 'mi_tabla', rule: 'RLS_OFF', reason: 'Por test' }
    ]
    const { findings, passedExceptions } = evaluateSecurityPosture(tables, exceptions)
    expect(findings).toHaveLength(0)
    expect(passedExceptions).toHaveLength(1)
  })

  it('debe fallar si tiene RLS encendido pero sin políticas', () => {
    const tables: Record<string, ActualTable> = {
      mi_tabla: { name: 'mi_tabla', rls: true, policies: [] }
    }
    const { findings } = evaluateSecurityPosture(tables, [])
    expect(findings).toHaveLength(1)
    expect(findings[0].rule).toBe('NO_POLICIES')
    expect(findings[0].level).toBe('ERROR')
  })

  it('debe pasar si tiene RLS encendido sin políticas y HAY excepción', () => {
    const tables: Record<string, ActualTable> = {
      mi_tabla: { name: 'mi_tabla', rls: true, policies: [] }
    }
    const exceptions: SecurityException[] = [
      { table: 'mi_tabla', rule: 'NO_POLICIES', reason: 'Por test' }
    ]
    const { findings } = evaluateSecurityPosture(tables, exceptions)
    expect(findings).toHaveLength(0)
  })

  it('debe fallar CRITICO si una policy incluye anon', () => {
    const tables: Record<string, ActualTable> = {
      mi_tabla: {
        name: 'mi_tabla', rls: true, policies: [
          { name: 'p1', cmd: 'SELECT', roles: ['anon'], qual: 'true', with_check: null }
        ]
      }
    }
    const { findings } = evaluateSecurityPosture(tables, [])
    // Va a disparar 2 hallazgos: USING_TRUE y ANON_PUBLIC_ROLE
    const anonFinding = findings.find(f => f.rule === 'ANON_PUBLIC_ROLE')
    expect(anonFinding).toBeDefined()
    expect(anonFinding?.level).toBe('CRITICAL')
  })

  it('debe ser WARNING si una policy incluye public pero tiene filtro efectivo (qual != true)', () => {
    const tables: Record<string, ActualTable> = {
      mi_tabla: {
        name: 'mi_tabla', rls: true, policies: [
          { name: 'p1', cmd: 'SELECT', roles: ['public'], qual: 'user_has_membership(location_id)', with_check: null }
        ]
      }
    }
    const { findings } = evaluateSecurityPosture(tables, [])
    expect(findings).toHaveLength(1)
    expect(findings[0].rule).toBe('ANON_PUBLIC_ROLE')
    expect(findings[0].level).toBe('WARNING')
  })

  it('debe fallar CRITICO si tiene USING(true) sin excepción', () => {
    const tables: Record<string, ActualTable> = {
      mi_tabla: {
        name: 'mi_tabla', rls: true, policies: [
          { name: 'p1', cmd: 'SELECT', roles: ['authenticated'], qual: 'true', with_check: null }
        ]
      }
    }
    const { findings } = evaluateSecurityPosture(tables, [])
    expect(findings).toHaveLength(1)
    expect(findings[0].rule).toBe('USING_TRUE')
    expect(findings[0].level).toBe('CRITICAL')
  })

  it('debe pasar si tiene USING(true) pero hay excepción por policyName', () => {
    const tables: Record<string, ActualTable> = {
      mi_tabla: {
        name: 'mi_tabla', rls: true, policies: [
          { name: 'p1', cmd: 'SELECT', roles: ['authenticated'], qual: 'true', with_check: null }
        ]
      }
    }
    const exceptions: SecurityException[] = [
      { table: 'mi_tabla', rule: 'USING_TRUE', policyName: 'p1', reason: 'Test' }
    ]
    const { findings, passedExceptions } = evaluateSecurityPosture(tables, exceptions)
    expect(findings).toHaveLength(0)
    expect(passedExceptions).toHaveLength(1)
  })

  it('(a) USING true service_role-only pasa', () => {
    const tables: Record<string, ActualTable> = {
      mi_tabla: {
        name: 'mi_tabla', rls: true, policies: [
          { name: 'p1', cmd: 'SELECT', roles: ['service_role'], qual: 'true', with_check: null }
        ]
      }
    }
    const { findings } = evaluateSecurityPosture(tables, [])
    expect(findings).toHaveLength(0)
  })

  it('(b) USING true con service_role+authenticated falla', () => {
    const tables: Record<string, ActualTable> = {
      mi_tabla: {
        name: 'mi_tabla', rls: true, policies: [
          { name: 'p1', cmd: 'SELECT', roles: ['authenticated', 'service_role'], qual: 'true', with_check: null }
        ]
      }
    }
    const { findings } = evaluateSecurityPosture(tables, [])
    expect(findings).toHaveLength(1)
    expect(findings[0].rule).toBe('USING_TRUE')
    expect(findings[0].level).toBe('CRITICAL')
  })

  it('(c) excepción por rol que coincide pasa', () => {
    const tables: Record<string, ActualTable> = {
      mi_tabla: {
        name: 'mi_tabla', rls: true, policies: [
          { name: 'p1', cmd: 'SELECT', roles: ['authenticated', 'custom_role'], qual: 'true', with_check: null }
        ]
      }
    }
    const exceptions: SecurityException[] = [
      { table: 'mi_tabla', rule: 'USING_TRUE', expectedRoles: ['custom_role', 'authenticated'], reason: 'Role match test' }
    ]
    const { findings, passedExceptions } = evaluateSecurityPosture(tables, exceptions)
    expect(findings).toHaveLength(0)
    expect(passedExceptions).toHaveLength(1)
  })

  it('(d) misma excepción con rol distinto falla', () => {
    const tables: Record<string, ActualTable> = {
      mi_tabla: {
        name: 'mi_tabla', rls: true, policies: [
          { name: 'p1', cmd: 'SELECT', roles: ['authenticated'], qual: 'true', with_check: null }
        ]
      }
    }
    const exceptions: SecurityException[] = [
      { table: 'mi_tabla', rule: 'USING_TRUE', expectedRoles: ['authenticated', 'custom_role'], reason: 'Role mismatch test' }
    ]
    const { findings, passedExceptions } = evaluateSecurityPosture(tables, exceptions)
    expect(findings).toHaveLength(1)
    expect(passedExceptions).toHaveLength(0)
    expect(findings[0].rule).toBe('USING_TRUE')
  })
})
