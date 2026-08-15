import '../scripts/assert-stg';
import { describe, it, expect } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { rolesForPath, ALL_DASHBOARD_ROLES } from '@/lib/page-access';
import { WRITE_ROLES } from '@/lib/authz';
import { proxy } from '@/proxy';
import { NextRequest } from 'next/server';

/**
 * 1) MATRIZ ESPERADA (Fixture independiente escrita por QA, hardcodeada a mano)
 * NO importa PAGE_ACCESS para construir la expectativa.
 */
interface MatrixEntry {
  route: string;
  justification: string;
  expected: Record<'owner' | 'manager' | 'encargado' | 'staff' | 'qa-b-owner', 'allow' | 'deny'>;
}

const EXPECTED_NAV_MATRIX: MatrixEntry[] = [
  {
    route: '/dashboard/owner/v2',
    justification: 'Dashboard principal de operaciones/métricas (shell de lectura), permitido a todos los roles',
    expected: { owner: 'allow', manager: 'allow', encargado: 'allow', staff: 'allow', 'qa-b-owner': 'allow' }
  },
  {
    route: '/dashboard/owner',
    justification: 'Ruta legacy del dashboard (shell de lectura), permitido a todos los roles',
    expected: { owner: 'allow', manager: 'allow', encargado: 'allow', staff: 'allow', 'qa-b-owner': 'allow' }
  },
  {
    route: '/dashboard/manager',
    justification: 'Vista de gestión operativa sin acciones de escritura ni P&L, permitido a todos los roles',
    expected: { owner: 'allow', manager: 'allow', encargado: 'allow', staff: 'allow', 'qa-b-owner': 'allow' }
  },
  {
    route: '/dashboard/pnl',
    justification: 'Modulo financiero sensible / P&L (WRITE_ROLES), restrigido solo a owner/super_admin',
    expected: { owner: 'allow', manager: 'deny', encargado: 'deny', staff: 'deny', 'qa-b-owner': 'allow' }
  },
  {
    route: '/dashboard/reconcile',
    justification: 'Modulo de conciliacion de ventas CucinaGo vs Maxirest (WRITE_ROLES), restringido solo a owner',
    expected: { owner: 'allow', manager: 'deny', encargado: 'deny', staff: 'deny', 'qa-b-owner': 'allow' }
  },
  {
    route: '/dashboard/upload',
    justification: 'Modulo de carga de archivos (mutacion de datos / WRITE_ROLES), restringido solo a owner',
    expected: { owner: 'allow', manager: 'deny', encargado: 'deny', staff: 'deny', 'qa-b-owner': 'allow' }
  },
  {
    route: '/dashboard/owner/v2?modulo=operaciones',
    justification: 'Sub-ruta de dashboard con query params, debe respetar el fallback/prefix de owner/v2',
    expected: { owner: 'allow', manager: 'allow', encargado: 'allow', staff: 'allow', 'qa-b-owner': 'allow' }
  },
  {
    route: '/dashboard/reportes-custom',
    justification: 'Ruta no listada en PAGE_ACCESS, prueba el fallback por defecto (ALL_DASHBOARD_ROLES)',
    expected: { owner: 'allow', manager: 'allow', encargado: 'allow', staff: 'allow', 'qa-b-owner': 'allow' }
  }
];

/**
 * 2) MOTOR PURO (Fixtures y Evaluador en Memoria, corre siempre sin DB)
 */
describe('Nav Gate (Motor Puro / Evaluador de Matriz)', () => {
  it('rolesForPath debe retornar WRITE_ROLES para rutas financieras/escritura', () => {
    expect(rolesForPath('/dashboard/pnl')).toEqual(WRITE_ROLES);
    expect(rolesForPath('/dashboard/reconcile')).toEqual(WRITE_ROLES);
    expect(rolesForPath('/dashboard/upload')).toEqual(WRITE_ROLES);
  });

  it('rolesForPath debe retornar ALL_DASHBOARD_ROLES para rutas de lectura y fallbacks', () => {
    expect(rolesForPath('/dashboard/owner/v2')).toEqual(ALL_DASHBOARD_ROLES);
    expect(rolesForPath('/dashboard/owner')).toEqual(ALL_DASHBOARD_ROLES);
    expect(rolesForPath('/dashboard/manager')).toEqual(ALL_DASHBOARD_ROLES);
    expect(rolesForPath('/dashboard/reportes-custom')).toEqual(ALL_DASHBOARD_ROLES);
  });

  it('Evaluador estatico debe coincidir exactamente con la matriz esperada de QA', () => {
    for (const entry of EXPECTED_NAV_MATRIX) {
      const allowedRoles = rolesForPath(entry.route);
      
      (['owner', 'manager', 'encargado', 'staff'] as const).forEach(role => {
        const expectedResult = entry.expected[role];
        const isAllowed = allowedRoles.includes(role);
        const actualResult = isAllowed ? 'allow' : 'deny';

        expect(
          actualResult,
          `Fallo de matriz en ruta ${entry.route} para rol ${role}. Esperado: ${expectedResult}, Obtenido: ${actualResult}`
        ).toBe(expectedResult);
      });
    }
  });
});

/**
 * 3) TEST DE INTEGRACION (contra STG con sesiones reales)
 */
const shouldRunIntegration = process.env.RUN_INTEGRATION_TESTS === 'true';

describe.runIf(shouldRunIntegration)('Nav Gate (Integración contra STG)', () => {
  const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supaAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  const testUsers = [
    { key: 'owner' as const, email: process.env.QA_OWNER_EMAIL!, pass: process.env.QA_OWNER_PASSWORD!, role: 'owner' },
    { key: 'manager' as const, email: process.env.QA_MANAGER_EMAIL!, pass: process.env.QA_MANAGER_PASSWORD!, role: 'manager' },
    { key: 'encargado' as const, email: process.env.QA_ENCARGADO_EMAIL!, pass: process.env.QA_ENCARGADO_PASSWORD!, role: 'encargado' },
    { key: 'staff' as const, email: process.env.QA_STAFF_EMAIL!, pass: process.env.QA_STAFF_PASSWORD!, role: 'staff' },
    { key: 'qa-b-owner' as const, email: process.env.QA_B_OWNER_EMAIL!, pass: process.env.QA_B_OWNER_PASSWORD!, role: 'owner' },
  ];

  it('Verifica comportamiento de navegación HTTP para cada usuario x cada ruta', async () => {
    const supa = createClient(supaUrl, supaAnonKey);

    for (const u of testUsers) {
      const { data: authData, error: authErr } = await supa.auth.signInWithPassword({
        email: u.email,
        password: u.pass,
      });

      expect(authErr, `Error de autenticación para ${u.email}`).toBeNull();
      expect(authData.session, `Sesión nula para ${u.email}`).toBeDefined();

      const session = authData.session!;
      const base64Session = 'base64-' + Buffer.from(JSON.stringify(session)).toString('base64');
      const projectRef = 'egjxyskqhnmuqwkrbshu';
      const cookieName = `sb-${projectRef}-auth-token`;

      for (const entry of EXPECTED_NAV_MATRIX) {
        const expectedDecision = entry.expected[u.key];
        const req = new NextRequest(`http://localhost:3000${entry.route}`, {
          headers: {
            cookie: `${cookieName}=${encodeURIComponent(base64Session)}; faro_role=${u.role}`,
          },
        });

        const res = await proxy(req);
        const status = res.status;
        const location = res.headers.get('location');

        if (expectedDecision === 'allow') {
          expect(
            status,
            `Rol [${u.key}] debio ingresar a [${entry.route}] (200), pero recibio HTTP ${status} (Redirect: ${location})`
          ).toBe(200);
        } else {
          expect(
            status,
            `Rol [${u.key}] debio ser redirigido desde [${entry.route}] (307), pero recibio HTTP ${status}`
          ).toBe(307);

          expect(
            location,
            `Rol [${u.key}] redirigido a URL incorrecta desd [${entry.route}]`
          ).toMatch(/\/role-select$/);
        }
      }
    }
  }, 30_000);
});
