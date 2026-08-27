import { describe, it, expect } from 'vitest'
import {
  analyzeAssertions,
  isAllowedNumericLiteral,
  isLiveIntegrationTest,
} from '../scripts/lib/assertion-engine'
import { QA_CANARIO_C01_MONTO, QA_TENANT_B_SYNTHETIC_SUM } from './helpers/synthetic-markers'

describe('Assertion Linter Engine (Motor Puro & Selector)', () => {
  describe('Allowlist de Literales Numéricos Seguros', () => {
    it('permite todos los códigos de estado HTTP estándar', () => {
      expect(isAllowedNumericLiteral(200)).toBe(true)
      expect(isAllowedNumericLiteral(201)).toBe(true)
      expect(isAllowedNumericLiteral(204)).toBe(true)
      expect(isAllowedNumericLiteral(307)).toBe(true)
      expect(isAllowedNumericLiteral(401)).toBe(true)
      expect(isAllowedNumericLiteral(403)).toBe(true)
      expect(isAllowedNumericLiteral(404)).toBe(true)
      expect(isAllowedNumericLiteral(422)).toBe(true)
      expect(isAllowedNumericLiteral(500)).toBe(true)
    })

    it('permite constantes estructurales e invariantes de signo/presencia (0, 1, -1)', () => {
      expect(isAllowedNumericLiteral(0)).toBe(true)
      expect(isAllowedNumericLiteral(1)).toBe(true)
      expect(isAllowedNumericLiteral(-1)).toBe(true)
    })

    it('rechaza números mágicos crudos en tests vivos (incluyendo totales sintéticos no nombrados)', () => {
      expect(isAllowedNumericLiteral(410)).toBe(false)
      expect(isAllowedNumericLiteral(363.5)).toBe(false)
      expect(isAllowedNumericLiteral(1045)).toBe(false)
      expect(isAllowedNumericLiteral(1999999.98)).toBe(false)
      expect(isAllowedNumericLiteral(888888.88)).toBe(false)
    })
  })

  describe('Detección del Selector (isLiveIntegrationTest)', () => {
    it('identifica test con RUN_INTEGRATION_TESTS como integración', () => {
      const code = `const shouldRun = process.env.RUN_INTEGRATION_TESTS === 'true'; describe.runIf(shouldRun)('test', () => {});`
      expect(isLiveIntegrationTest(code, 'tests/sample.test.ts')).toBe(true)
    })

    it('identifica script que consulta Supabase como integración', () => {
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

  describe('analyzeAssertions (Detección de Aserciones Frágiles y Canarios)', () => {
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

    it('detecta literales sintéticos crudos y sugiere importar la constante nombrada', () => {
      const code = `${integrationHeader}expect(row.monto).toBe(888888.88);`
      const findings = analyzeAssertions(code, 'tests/example.test.ts')
      expect(findings).toHaveLength(1)
      expect(findings[0].literal).toBe(888888.88)
      expect(findings[0].suggestion).toContain('tests/helpers/synthetic-markers.ts')
    })

    it('permite referencias a constantes nombradas de marcadores sintéticos', () => {
      const code = `${integrationHeader}
        import { QA_CANARIO_C01_MONTO } from './helpers/synthetic-markers';
        expect(row.monto).toBe(QA_CANARIO_C01_MONTO);
      `
      const findings = analyzeAssertions(code, 'tests/example.test.ts')
      expect(findings).toHaveLength(0)
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
  })

  describe('Pruebas Históricas de Regresión (Snippets Reales de Deuda Pasada)', () => {
    it('detecta los 3 casos de toBe(410) del commit 9f9aeca en tests/documento-peso.test.ts', () => {
      const historicalSnippet = `
        const shouldRunIntegration = process.env.RUN_INTEGRATION_TESTS === 'true';
        describe.runIf(shouldRunIntegration)('Documento Peso', () => {
          it('neto de Julio', async () => {
            const supabase = createClient('url', 'key');
            const dataJulio = { tickets: 410 };
            expect(dataJulio.tickets).toBe(410);
            const totalDaily = 410;
            expect(totalDaily).toBe(410);
            const totalTickets = 410;
            expect(totalTickets).toBe(410);
          });
        });
      `
      const findings = analyzeAssertions(historicalSnippet, 'tests/documento-peso.test.ts')
      expect(findings).toHaveLength(3)
      expect(findings.every(f => f.literal === 410)).toBe(true)
    })

    it('detecta assert(n === 363) del commit 586488c~1 en scripts/regression-test.ts', () => {
      const historicalSnippet = `
        import { createClient } from '@supabase/supabase-js';
        async function run() {
          const rows = await sql('SELECT count(*) as n FROM financial_results');
          const n = rows[0].n;
          assert(n === 363, 'count = 363');
        }
      `
      const findings = analyzeAssertions(historicalSnippet, 'scripts/regression-test.ts')
      expect(findings).toHaveLength(1)
      expect(findings[0].literal).toBe(363)
      expect(findings[0].matcher).toBe('===')
      expect(findings[0].expression).toBe('n')
    })
  })
})
