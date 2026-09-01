import { describe, it, expect } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

/**
 * 1) MOTOR PURO (fixtures, sin DB)
 * Réplica de la lógica de la DB (documento_peso / documento_es_reverso) para asegurar que 
 * conceptualmente el comportamiento sea validado en memoria por los tests.
 */
function documento_peso(tipo_documento: string, total: number): number {
  if (tipo_documento === 'Nota de Crédito' || total < 0) return -1;
  return 1;
}

function documento_es_reverso(tipo_documento: string, total: number): boolean {
  return tipo_documento === 'Nota de Crédito' || total < 0;
}

describe('Documento Peso (Motor Puro / Lógica en Memoria)', () => {
  it('Debe sumar 1 para ventas normales', () => {
    expect(documento_peso('Comanda', 1500)).toBe(1);
    expect(documento_peso('Ticket', 5000)).toBe(1);
  });

  it('Debe sumar 1 para ventas en $0 (100% descuento)', () => {
    expect(documento_peso('Comanda', 0)).toBe(1);
  });

  it('Debe restar 1 (-1) para Notas de Crédito', () => {
    expect(documento_peso('Nota de Crédito', 1500)).toBe(-1);
    // Aunque el total sea positivo, el tipo de documento fuerza -1
  });

  it('Debe restar 1 (-1) si el total es negativo por contingencia', () => {
    expect(documento_peso('Comanda', -500)).toBe(-1);
  });

  it('documento_es_reverso debe detectar correctamente reversos', () => {
    expect(documento_es_reverso('Comanda', 1500)).toBe(false);
    expect(documento_es_reverso('Comanda', 0)).toBe(false);
    expect(documento_es_reverso('Nota de Crédito', 1500)).toBe(true);
    expect(documento_es_reverso('Comanda', -500)).toBe(true);
  });
});


/**
 * 2) TEST DE INTEGRACIÓN (contra STG)
 * 
 * IMPORTANTE: Requiere sesión autenticada. No puede usar service_role key 
 * porque las funciones (como get_ventas_mensuales) incluyen un gate 
 * `user_has_membership` que chequea auth.uid().
 * 
 * Requisitos para correr en CI (STG):
 * - RUN_INTEGRATION_TESTS=true
 * - NEXT_PUBLIC_SUPABASE_URL (URL de STG)
 * - NEXT_PUBLIC_SUPABASE_ANON_KEY (Publishable Key / Anon)
 * - QA_OWNER_EMAIL / QA_OWNER_PASSWORD (mismo owner que cross-tenant.test.ts
 *   y role-gating.test.ts — un solo par de credenciales para las 3 suites)
 */
const shouldRunIntegration = process.env.RUN_INTEGRATION_TESTS === 'true';

describe.runIf(shouldRunIntegration)('Documento Peso (Integración contra STG)', () => {
  it('get_ventas_mensuales, get_daily_sales_full y get_ticket_promedio_full deben coincidir en el neto de Julio 2026', async () => {
    // 15_000 no alcanzaba en CI: cuando el PR apunta a main, ci.yml corre
    // este job de integracion en paralelo con los dos jobs de
    // regression-test.yml (branches: [develop, main]) contra el MISMO
    // proyecto STG (egjxyskqhnmuqwkrbshu) -- 3 workflows concurrentes
    // pegandole a la misma base. Localmente, sin esa contencion, esta
    // query tarda ~2.3s (medido 2026-09-01); en CI llego a superar 15s.
    // No es una regresion de #67/#68 -- ninguna de las dos toca estas RPCs
    // ni documento_peso() -- es el timeout peleando con carga concurrente
    // de otros jobs sobre el mismo STG.
    // Antes este test fijaba un número mágico (410) capturado en un momento
    // dado — quedaba roto cada vez que STG recibía más datos de Julio (igual
    // que financial_results: count = 363, ver regression-test.ts). El
    // invariante real que vale la pena proteger es que las 3 RPCs, que
    // agregan por mes/día/ticket-promedio respectivamente, concuerden entre
    // sí en el neto (documento_peso ya restó las Notas de Crédito en las 3).
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const supabase = createClient(url, key);

    const { error: authError } = await supabase.auth.signInWithPassword({
      email: process.env.QA_OWNER_EMAIL!,
      password: process.env.QA_OWNER_PASSWORD!,
    });

    expect(authError).toBeNull();

    const locationId = 'bbbbbbbb-0000-0000-0000-000000000001';

    // Probar get_ventas_mensuales
    const { data: mensuales, error: err1 } = await supabase.rpc('get_ventas_mensuales', { p_location_id: locationId });
    expect(err1).toBeNull();
    const dataJulio = mensuales?.find((r: any) => r.mes === '2026-07' || r.mes === 7);
    expect(dataJulio).toBeDefined();
    expect(dataJulio.tickets).toBeGreaterThan(0);
    const netoMensual = dataJulio.tickets;

    // Probar get_daily_sales_full (sumatoria) — debe coincidir con el mensual
    const { data: daily, error: err2 } = await supabase.rpc('get_daily_sales_full', { p_location_id: locationId });
    expect(err2).toBeNull();
    const dailyJulio = daily?.filter((r: any) => r.fecha?.startsWith('2026-07'));
    const totalDaily = dailyJulio.reduce((acc: number, row: any) => acc + row.tickets, 0);
    expect(totalDaily).toBe(netoMensual);

    // Ticket Promedio — misma sumatoria, misma fuente, debe coincidir también
    const { data: ticketProm, error: err3 } = await supabase.rpc('get_ticket_promedio_full', { p_location_id: locationId });
    expect(err3).toBeNull();
    const tpJulio = ticketProm?.filter((r: any) => r.fecha?.startsWith('2026-07'));
    const totalTickets = tpJulio.reduce((acc: number, row: any) => acc + row.tickets, 0);
    expect(totalTickets).toBe(netoMensual);
  }, 30_000);
});


/**
 * 3) INVARIANTE ANTI-REGRESIÓN SQL (Análisis Estático)
 * 
 * Este test corre siempre sin DB, analizando los archivos de migración de Supabase.
 * Lista todas las funciones y se queda con la definición más reciente.
 * Si la función lee `sales_documents` y hace `COUNT(*)` o similar, debe utilizar
 * obligatoriamente `documento_peso`. Si no lo usa, el test falla atrapando la regresión.
 */
describe('Invariante Anti-Regresión SQL (Análisis Estático de Migraciones)', () => {
  it('Toda función que cuente sales_documents debe usar documento_peso', () => {
    const migrationsDir = path.join(process.cwd(), 'supabase', 'migrations');
    
    // Si no existe la carpeta, se skipea silenciosamente (por si el path varía en CI)
    if (!fs.existsSync(migrationsDir)) return;

    const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();
    
    // Mapa para mantener solo la última versión de cada función
    const latestFunctions: Record<string, { file: string, body: string }> = {};

    for (const file of files) {
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
      
      // Separar por definiciones de función
      const blocks = sql.split(/CREATE (?:OR REPLACE )?FUNCTION/i);
      
      for (let i = 1; i < blocks.length; i++) {
        const block = blocks[i];
        const match = block.match(/^\s*(?:public\.)?([a-zA-Z0-9_]+)/i);
        if (match) {
          const fnName = match[1];
          latestFunctions[fnName] = { file, body: block };
        }
      }
    }

    // Analizar las últimas versiones
    const violations = [];
    const whitelist = ['generate_ticket_hash', 'block_upload_events_modifications', 'commit_upload']; // Funciones permitidas que podrían tener count por otra razón

    for (const [name, { file, body }] of Object.entries(latestFunctions)) {
      if (whitelist.includes(name)) continue;

      const lowerBody = body.toLowerCase();
      
      // Si la función consulta la tabla sales_documents
      if (lowerBody.includes('sales_documents')) {
        // Y si la función utiliza un agregador count(*), count(1) o count(columna)
        if (lowerBody.match(/count\s*\(\s*(?:\*|1|[a-zA-Z0-9_.]+)\s*\)/)) {
          // Exigir que también utilice documento_peso
          if (!lowerBody.includes('documento_peso')) {
            violations.push(`${name} (visto por última vez en ${file}) usa COUNT sin documento_peso`);
          }
        }
      }
    }

    if (violations.length > 0) {
      console.error('Funciones en violación del invariante documento_peso:');
      violations.forEach(v => console.error(`- ${v}`));
    }
    
    expect(violations.length).toBe(0);
  });
});
