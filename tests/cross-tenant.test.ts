// @vitest-environment node
// Real network against STG, no DOM needed -- see role-gating.test.ts for the
// jsdom fetch quirk this avoids.
import { describe, it, expect, beforeAll } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const shouldRunIntegration = process.env.RUN_INTEGRATION_TESTS === 'true';

describe.runIf(shouldRunIntegration)('Cross-Tenant Isolation (Integración contra STG)', () => {
  // createClient() valida la URL al construirse y tira si es undefined.
  // describe.runIf(false) solo saltea los it() -- el cuerpo del describe
  // igual corre en la fase de colección, así que esto NO puede vivir acá
  // arriba: rompería la colección entera de este archivo en cualquier run
  // sin las env vars de integración (o sea, casi todos los PRs a develop).
  let supabase: SupabaseClient;

  const emailA = process.env.QA_OWNER_EMAIL!;
  const passA = process.env.QA_OWNER_PASSWORD!;
  const locationB = process.env.QA_TENANT_B_LOCATION_ID!;

  beforeAll(async () => {
    supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
    // Authenticate as Org A Owner
    const { error } = await supabase.auth.signInWithPassword({
      email: emailA,
      password: passA,
    });
    expect(error).toBeNull();
  });

  it('Usuario A no puede leer sales_documents de la location B vía SELECT directo', async () => {
    const { data, error } = await supabase
      .from('sales_documents')
      .select('*')
      .eq('location_id', locationB)
      .limit(10);

    // Debe devolver vacío sin fallar (aislamiento RLS clásico)
    expect(error).toBeNull();
    expect(data?.length).toBe(0);
  }, 15_000);

  it('Usuario A recibe 0 filas o vacío al invocar RPCs con location_id de la location B', async () => {
    // Test get_ventas_mensuales
    const { data: mensuales, error: err1 } = await supabase.rpc('get_ventas_mensuales', { p_location_id: locationB });
    expect(err1).toBeNull();
    expect(mensuales?.length || 0).toBe(0);

    // Test get_ventas_cascada_semanal
    const { data: cascada, error: err2 } = await supabase.rpc('get_ventas_cascada_semanal', { p_location_id: locationB });
    expect(err2).toBeNull();
    expect(cascada?.length || 0).toBe(0);
  }, 15_000);
});
