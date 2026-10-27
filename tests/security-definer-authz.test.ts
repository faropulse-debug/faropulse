import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

/**
 * INVARIANTE ANTI-REGRESIÓN: autorización por location, no por org (S2-1 / P0-A)
 *
 * Corre siempre, sin DB, analizando supabase/migrations/ (mismo enfoque que el
 * invariante de documento-peso.test.ts): se queda con la ÚLTIMA definición de
 * cada función y, si es SECURITY DEFINER, falla si autoriza con
 * `l.org_id = m.org_id` — "el usuario tiene alguna membership en la org dueña
 * del local", que deja a un empleado leer cualquier local de su org.
 * El patrón correcto es `public.user_has_membership(p_location_id)`.
 */

const ORG_JOIN = /\bl\.org_id\s*=\s*m\.org_id\b|\bm\.org_id\s*=\s*l\.org_id\b/i;
const CREATE_FN = /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:public\.)?"?([a-zA-Z0-9_]+)"?\s*\(/gi;

type FnDef = { file: string; securityDefiner: boolean; body: string };

function latestFunctionDefs(migrationsDir: string): Record<string, FnDef> {
  const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();
  const latest: Record<string, FnDef> = {};

  for (const file of files) {
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
    for (const m of sql.matchAll(CREATE_FN)) {
      const rest = sql.slice(m.index!);
      const as = rest.match(/\bAS\s+(\$[a-zA-Z0-9_]*\$)/i);
      if (!as) continue;
      const bodyStart = as.index! + as[0].length;
      const bodyEnd = rest.indexOf(as[1], bodyStart);
      if (bodyEnd === -1) continue;
      const header = rest.slice(0, as.index!);
      const afterBody = rest.slice(bodyEnd + as[1].length);
      const tail = afterBody.slice(0, Math.max(0, afterBody.indexOf(';')));
      latest[m[1]] = {
        file,
        securityDefiner: /SECURITY\s+DEFINER/i.test(header + tail),
        // Comentarios fuera: un patrón comentado no autoriza nada.
        body: rest.slice(bodyStart, bodyEnd).replace(/--[^\n]*/g, ''),
      };
    }
  }
  return latest;
}

function orgJoinViolations(migrationsDir: string): string[] {
  return Object.entries(latestFunctionDefs(migrationsDir))
    .filter(([, d]) => d.securityDefiner && ORG_JOIN.test(d.body))
    .map(([name, d]) => `${name} (última definición en ${d.file})`)
    .sort();
}

const MIGRATIONS_DIR = path.join(process.cwd(), 'supabase', 'migrations');

describe('Invariante: SECURITY DEFINER autoriza por location_id, no por org', () => {
  it('ninguna función SECURITY DEFINER (última definición) usa l.org_id = m.org_id', () => {
    const violations = orgJoinViolations(MIGRATIONS_DIR);
    if (violations.length > 0) {
      console.error('Funciones SECURITY DEFINER que autorizan por org en vez de por location:');
      violations.forEach(v => console.error(`- ${v}`));
    }
    expect(violations).toEqual([]);
  });

  describe('control positivo (fixtures en un dir temporal)', () => {
    let dir: string;
    const write = (name: string, sql: string) => fs.writeFileSync(path.join(dir, name), sql);

    const OLD_GATE = `CREATE OR REPLACE FUNCTION public.get_fixture(p_location_id uuid)
 RETURNS TABLE(x int)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT 1 FROM sales_documents d
  WHERE d.location_id = p_location_id
    AND EXISTS (
      SELECT 1 FROM memberships m
      JOIN locations l ON l.org_id = m.org_id
      WHERE m.user_id = auth.uid() AND m.is_active = true AND l.id = p_location_id
    );
$function$;
`;
    const NEW_GATE = `CREATE OR REPLACE FUNCTION public.get_fixture(p_location_id uuid)
 RETURNS TABLE(x int)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT 1 FROM sales_documents d
  WHERE d.location_id = p_location_id
    AND public.user_has_membership(p_location_id);
$function$;
`;

    beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'secdef-authz-')); });
    afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

    it('las migraciones reales + una migración nueva con el patrón viejo → el invariante falla', () => {
      for (const f of fs.readdirSync(MIGRATIONS_DIR).filter(f => f.endsWith('.sql')))
        fs.copyFileSync(path.join(MIGRATIONS_DIR, f), path.join(dir, f));
      write('99990101000001_fixture_org_join.sql', OLD_GATE);
      expect(orgJoinViolations(dir)).toContain(
        'get_fixture (última definición en 99990101000001_fixture_org_join.sql)',
      );
    });

    it('una migración con el patrón viejo SÍ se detecta', () => {
      write('99990101000001_fixture_org_join.sql', OLD_GATE);
      expect(orgJoinViolations(dir)).toEqual([
        'get_fixture (última definición en 99990101000001_fixture_org_join.sql)',
      ]);
    });

    it('si una migración posterior lo corrige, deja de ser violación (cuenta la última definición)', () => {
      write('99990101000001_fixture_org_join.sql', OLD_GATE);
      write('99990101000002_fixture_fix.sql', NEW_GATE);
      expect(orgJoinViolations(dir)).toEqual([]);
    });

    it('SECURITY DEFINER declarado después del cuerpo también cuenta', () => {
      write('99990101000001_fixture_plpgsql.sql', `CREATE FUNCTION get_fixture2(p_location_id uuid) RETURNS int AS $$
BEGIN
  PERFORM 1 FROM memberships m JOIN locations l ON m.org_id = l.org_id WHERE l.id = p_location_id;
  RETURN 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
`);
      expect(orgJoinViolations(dir)).toEqual([
        'get_fixture2 (última definición en 99990101000001_fixture_plpgsql.sql)',
      ]);
    });

    it('una función SECURITY INVOKER con el patrón no es violación de esta regla', () => {
      write('99990101000001_fixture_invoker.sql', OLD_GATE.replace('SECURITY DEFINER', 'SECURITY INVOKER'));
      expect(orgJoinViolations(dir)).toEqual([]);
    });
  });
});
