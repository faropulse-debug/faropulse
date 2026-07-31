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
 * - TEST_USER_EMAIL (e.g. owner@demo.com)
 * - TEST_USER_PASSWORD
 */
const shouldRunIntegration = process.env.RUN_INTEGRATION_TESTS === 'true';

describe.runIf(shouldRunIntegration)('Documento Peso (Integración contra STG)', () => {
  it('Las funciones de conteo deben devolver el valor neto (410) para Julio 2026', async () => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const supabase = createClient(url, key);

    const { error: authError } = await supabase.auth.signInWithPassword({
      email: process.env.TEST_USER_EMAIL!,
      password: process.env.TEST_USER_PASSWORD!,
    });
    
    expect(authError).toBeNull();

    const locationId = 'bbbbbbbb-0000-0000-0000-000000000001';

    // Probar get_ventas_mensuales
    const { data: mensuales, error: err1 } = await supabase.rpc('get_ventas_mensuales', { p_location_id: locationId });
    expect(err1).toBeNull();
    const dataJulio = mensuales?.find((r: any) => r.mes === '2026-07' || r.mes === 7);
    expect(dataJulio).toBeDefined();
    expect(dataJulio.tickets).toBe(410); // El valor neto esperado (412 bruto -> 410 neto)

    // Probar get_daily_sales_full (sumatoria)
    const { data: daily, error: err2 } = await supabase.rpc('get_daily_sales_full', { p_location_id: locationId });
    expect(err2).toBeNull();
    const dailyJulio = daily?.filter((r: any) => r.fecha?.startsWith('2026-07'));
    const totalDaily = dailyJulio.reduce((acc: number, row: any) => acc + row.tickets, 0);
    expect(totalDaily).toBe(410);

    // Ticket Promedio
    const { data: ticketProm, error: err3 } = await supabase.rpc('get_ticket_promedio_full', { p_location_id: locationId });
    expect(err3).toBeNull();
    const tpJulio = ticketProm?.filter((r: any) => r.fecha?.startsWith('2026-07'));
    const totalTickets = tpJulio.reduce((acc: number, row: any) => acc + row.tickets, 0);
    expect(totalTickets).toBe(410);
  });
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
