import { describe, it, expect } from 'vitest'
import {
  analyzeAssertions,
  isAllowedNumericLiteral,
  isLiveIntegrationTest,
  ALLOWED_HTTP_STATUS_CODES,
  ALLOWED_INVARIANT_CONSTANTS,
  ALLOWED_SYNTHETIC_MARKERS,
} from '../scripts/lib/assertion-engine'

describe('Assertion Linter Engine (Motor Puro)', () => {
  describe('Allowlist de Literales Numéricos Seguros', () => {
    it('permite todos los códigos de estado HTTP estándar', () => {
      expect(isAllowedNumericLiteral(200)).toBe(true)
      expect(isAllowedNumericLiteral(307)).toBe(true)
      expect(isAllowedNumericLiteral(401)).toBe(true)
      expect(isAllowedNumericLiteral(403)).toBe(true)
      expect(isAllowedNumericLiteral(404)).toBe(true)
      expect(isAllowedNumericLiteral(422)).toBe(true)
      expect(isAllowedNumericLiteral(500)).toBe(true)
    })

    it('permite constantes estructurales e invariantes (0, 1, -1)', () => {
      expect(isAllowedNumericLiteral(0)).toBe(true)
      expect(isAllowedNumericLiteral(1)).toBe(true)
      expect(isAllowedNumericLiteral(-1)).toBe(true)
    })

    it('permite marcadores sintéticos deliberados (QA Tenant B y Canario C-01)', () => {
      expect(isAllowedNumericLiteral(555555.55)).toBe(true)
      expect(isAllowedNumericLiteral(666666.66)).toBe(true)
      expect(isAllowedNumericLiteral(777777.77)).toBe(true)
      expect(isAllowedNumericLiteral(888888.88)).toBe(true)
      expect(isAllowedNumericLiteral(1999999.98)).toBe(true)
    })

    it('rechaza números mágicos dependientes de datos vivos', () => {
      expect(isAllowedNumericLiteral(410)).toBe(false)
      expect(isAllowedNumericLiteral(363.5)).toBe(false)
      expect(isAllowedNumericLiteral(1045)).toBe(false)
      expect(isAllowedNumericLiteral(42)).toBe(false)
    })
  })

  describe('Detección de Tests de Integración vs Unitarios Puros', () => {
    it('identifica test con RUN_INTEGRATION_TESTS como integración', () => {
      const code = `const shouldRun = process.env.RUN_INTEGRATION_TESTS === 'true'; describe.runIf(shouldRun)('test', () => {});`
      expect(isLiveIntegrationTest(code, 'tests/sample.test.ts')).toBe(true)
    })

    it('identifica script con createClient como integración', () => {
      const code = `import { createClient } from '@supabase/supabase-js'; const s = createClient('url', 'key');`
      expect(isLiveIntegrationTest(code, 'scripts/sample.ts')).toBe(true)
    })

    it('no marca test puramente unitario con vi.mock(@supabase/supabase-js)', () => {
      const code = `vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn() })); expect(1).toBe(1);`
      expect(isLiveIntegrationTest(code, 'tests/unit.test.ts')).toBe(false)
    })

    it('no marca test puramente unitario con fixtures en memoria', () => {
      const code = `const FIXTURE = [{ a: 100 }]; describe('pure', () => { it('works', () => expect(FIXTURE.length).toBe(1)); });`
      expect(isLiveIntegrationTest(code, 'tests/pure.test.ts')).toBe(false)
    })
  })

  describe('analyzeAssertions (Detección de Aserciones Frágiles)', () => {
    const integrationHeader = `const run = process.env.RUN_INTEGRATION_TESTS === 'true';\n`

    it('detecta expect(data.length).toBe(410) en test de integración', () => {
      const code = `${integrationHeader}expect(data.length).toBe(410);`
      const findings = analyzeAssertions(code, 'tests/example.test.ts')
      expect(findings).toHaveLength(1)
      expect(findings[0]).toMatchObject({
        line: 2,
        literal: 410,
        matcher: 'toBe',
        expression: 'data.length',
        rule: 'NO_BRITTLE_NUMERIC_ASSERTION',
      })
      expect(findings[0].suggestion).toContain('invariante relacional')
    })

    it('detecta expect(total).toEqual(363.5)', () => {
      const code = `${integrationHeader}expect(total).toEqual(363.5);`
      const findings = analyzeAssertions(code, 'tests/example.test.ts')
      expect(findings).toHaveLength(1)
      expect(findings[0].literal).toBe(363.5)
      expect(findings[0].matcher).toEqual('toEqual')
    })

    it('detecta assert(rows.length === 150)', () => {
      const code = `${integrationHeader}assert(rows.length === 150, 'deben ser 150');`
      const findings = analyzeAssertions(code, 'tests/example.test.ts')
      expect(findings).toHaveLength(1)
      expect(findings[0].literal).toBe(150)
      expect(findings[0].matcher).toBe('===')
      expect(findings[0].expression).toBe('rows.length')
    })

    it('ignora status HTTP permitidos (toBe(200), toBe(307), toBe(403))', () => {
      const code = `${integrationHeader}
        expect(res.status).toBe(200);
        expect(res.status).toBe(307);
        expect(res.status).toBe(403);
      `
      const findings = analyzeAssertions(code, 'tests/example.test.ts')
      expect(findings).toHaveLength(0)
    })

    it('ignora comparaciones contra 0, 1, -1 (invariantes de presencia y signos)', () => {
      const code = `${integrationHeader}
        expect(data?.length).toBe(0);
        expect(documento_peso('Comanda', 100)).toBe(1);
        expect(documento_peso('NC', 100)).toBe(-1);
      `
      const findings = analyzeAssertions(code, 'tests/example.test.ts')
      expect(findings).toHaveLength(0)
    })

    it('ignora marcadores sintéticos deliberados (888888.88, 555555.55)', () => {
      const code = `${integrationHeader}
        expect(row.monto).toBe(888888.88);
        expect(tenantB.total).toBe(555555.55);
      `
      const findings = analyzeAssertions(code, 'tests/example.test.ts')
      expect(findings).toHaveLength(0)
    })

    it('ignora comparaciones entre dos variables/invariantes derivadas', () => {
      const code = `${integrationHeader}
        expect(totalDaily).toBe(netoMensual);
        expect(totalTickets).toBe(netoMensual);
      `
      const findings = analyzeAssertions(code, 'tests/example.test.ts')
      expect(findings).toHaveLength(0)
    })

    it('ignora matchers de desigualdad (toBeGreaterThan, toBeCloseTo)', () => {
      const code = `${integrationHeader}
        expect(dataJulio.tickets).toBeGreaterThan(0);
        expect(variance).toBeCloseTo(10.5, 1);
      `
      const findings = analyzeAssertions(code, 'tests/example.test.ts')
      expect(findings).toHaveLength(0)
    })

    it('ignora archivos unitarios puros sin llamadas a BD viva', () => {
      const code = `
        const MAY26 = [{ pedidos: 100, ventas: 5000 }];
        expect(MAY26.length).toBe(1);
        expect(MAY26[0].pedidos).toBe(100);
      `
      const findings = analyzeAssertions(code, 'tests/pure-unit.test.ts')
      expect(findings).toHaveLength(0)
    })
  })
})
