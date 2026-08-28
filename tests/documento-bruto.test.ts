// @vitest-environment node
// Real network contra STG, no necesita DOM — ver role-gating.test.ts para el
// motivo (jsdom + fetch tiene una particularidad que este patrón evita).
import { describe, it, expect, beforeAll } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import {
  QA_DOCUMENTO_BRUTO_NORMAL_ESPERADO,
  QA_DOCUMENTO_BRUTO_REVERSO_ESPERADO,
} from './helpers/synthetic-markers'

const shouldRunIntegration = process.env.RUN_INTEGRATION_TESTS === 'true'

describe.runIf(shouldRunIntegration)('documento_bruto() — guard de reversos (dato sintético)', () => {
  // documento_bruto no es SECURITY DEFINER ni toca tablas — no necesita
  // membership, alcanza con el cliente anon.
  let supabase: SupabaseClient

  beforeAll(() => {
    supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
  })

  it('caso normal: sin reverso, devuelve ABS(bruto_items) sin invertir signo', async () => {
    const { data, error } = await supabase.rpc('documento_bruto', {
      p_bruto_items: 121212,
      p_total: 100000,
      p_descuento: 15,
      p_tipo_documento: 'Factura Venta',
    })
    expect(error).toBeNull()
    expect(data).toBe(QA_DOCUMENTO_BRUTO_NORMAL_ESPERADO)
  })

  it('caso reverso: cantidad y precio_unitario negados (patrón real de la NC de STG) — el guard invierte el signo', async () => {
    // bruto_items positivo (+64200) porque cantidad=-1 * precio_unitario=-64200
    // en cada línea, exactamente como en X 00001-00006097 (la única Nota de
    // Crédito real de STG). Sin el guard, esto saldría en +64200 aunque el
    // total sea -64200 — signo invertido.
    const { data, error } = await supabase.rpc('documento_bruto', {
      p_bruto_items: 64200,
      p_total: -64200,
      p_descuento: 100,
      p_tipo_documento: 'Nota de Crédito Int. Venta',
    })
    expect(error).toBeNull()
    expect(data).toBe(QA_DOCUMENTO_BRUTO_REVERSO_ESPERADO)
  })

  it('huérfano al 100%: sin items (bruto_items NULL) y sin fórmula posible → NULL, no 0', async () => {
    const { data, error } = await supabase.rpc('documento_bruto', {
      p_bruto_items: null,
      p_total: 0,
      p_descuento: 100,
      p_tipo_documento: 'Factura Int. Venta',
    })
    expect(error).toBeNull()
    // 0 afirmaría "no perdiste plata"; la verdad acá es "no sé" -> NULL.
    expect(data).toBeNull()
  })
})

describe.runIf(shouldRunIntegration)('Invariante: SUM(precio_total items) = total del documento', () => {
  let supabase: SupabaseClient
  const LOCATION_ID = 'bbbbbbbb-0000-0000-0000-000000000001' // location de QA_OWNER en STG

  beforeAll(async () => {
    supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
    const { error } = await supabase.auth.signInWithPassword({
      email: process.env.QA_OWNER_EMAIL!,
      password: process.env.QA_OWNER_PASSWORD!,
    })
    expect(error).toBeNull()
  })

  // Es un test de INVARIANTE (proporción), no de valor absoluto: el dataset
  // de STG crece con cada ingesta diaria, así que no se ata a conteos que
  // vencen. La colisión conocida de external_id (B 00002-00000009 — ver
  // informe "Descuentos — bruto derivado") se excluye explícitamente porque
  // contamina la suma (mezcla items de hasta 26 documentos distintos que
  // comparten esa clave). El umbral (99%) deja margen para que aparezcan
  // mismatches nuevos sin que el test se rompa por ruido, pero explota si el
  // método deja de ser válido en general.
  it('al menos 99% de los documentos con items (excluida la colisión conocida) matchean al peso', async () => {
    // PostgREST tapa cada response en 1000 filas sin importar .limit(), y
    // .range() pagina por OFFSET -- en una tabla de 88k filas eso escanea y
    // descarta todo lo anterior en cada página y le pega un statement timeout
    // a STG bajo cualquier concurrencia (57014, verificado). Keyset pagination
    // sobre `id` (PK, indexado) es liviana: cada página es un index seek, no
    // un scan creciente. Secuencial a propósito — es una DB compartida.
    const PAGE = 1000
    async function fetchAll<T extends { id: string }>(
      build: (afterId: string | null) => Promise<{ data: T[] | null; error: unknown }>,
    ): Promise<T[]> {
      const all: T[] = []
      let afterId: string | null = null
      for (;;) {
        const { data, error } = await build(afterId)
        expect(error).toBeNull()
        if (!data || data.length === 0) break
        all.push(...data)
        afterId = data[data.length - 1].id
        if (data.length < PAGE) break
      }
      return all
    }

    const docs = await fetchAll<{ id: string; external_id: string; fecha_caja: string; total: number }>(async afterId => {
      let q = supabase
        .from('sales_documents')
        .select('id, external_id, fecha_caja, total')
        .eq('location_id', LOCATION_ID)
        .neq('external_id', 'B 00002-00000009')
        .not('external_id', 'is', null)
        .not('fecha_caja', 'is', null)
        .order('id')
        .limit(PAGE)
      if (afterId) q = q.gt('id', afterId)
      return await q
    })
    expect(docs.length).toBeGreaterThan(0)

    const items = await fetchAll<{ id: string; numero_ticket: string; fecha_caja: string; precio_total: number }>(async afterId => {
      let q = supabase
        .from('sales_items')
        .select('id, numero_ticket, fecha_caja, precio_total')
        .eq('location_id', LOCATION_ID)
        .neq('numero_ticket', 'B 00002-00000009')
        .order('id')
        .limit(PAGE)
      if (afterId) q = q.gt('id', afterId)
      return await q
    })
    expect(items.length).toBeGreaterThan(0)

    const sumByKey = new Map<string, number>()
    for (const it of items) {
      const key = `${it.numero_ticket}|${it.fecha_caja}`
      sumByKey.set(key, (sumByKey.get(key) ?? 0) + Number(it.precio_total))
    }

    let withItems = 0
    let matching = 0
    for (const d of docs) {
      const key = `${d.external_id}|${d.fecha_caja}`
      if (!sumByKey.has(key)) continue // huérfano, cubierto por el guard de NULL, no por este invariante
      withItems++
      const diff = Math.abs(sumByKey.get(key)! - Number(d.total))
      if (diff <= 1) matching++
    }

    expect(withItems).toBeGreaterThan(0)
    const ratio = matching / withItems
    expect(ratio).toBeGreaterThanOrEqual(0.99)
  }, 120_000)
})

describe.runIf(shouldRunIntegration)('get_descuentos_top_tickets / get_descuentos_resumen — gate de membership intacto', () => {
  let supabase: SupabaseClient
  const LOCATION_ID = 'bbbbbbbb-0000-0000-0000-000000000001' // location de QA_OWNER, no de QA_B_OWNER

  beforeAll(async () => {
    supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
    const { error } = await supabase.auth.signInWithPassword({
      email: process.env.QA_B_OWNER_EMAIL!,
      password: process.env.QA_B_OWNER_PASSWORD!,
    })
    expect(error).toBeNull()
  })

  it('usuario sin membership sobre la location recibe vacío, no error ni datos ajenos', async () => {
    const { data: top, error: e1 } = await supabase.rpc('get_descuentos_top_tickets', {
      p_location_id: LOCATION_ID,
      p_desde: '2026-08-01',
      p_hasta: '2026-08-31',
    })
    expect(e1).toBeNull()
    expect(top?.length).toBe(0)

    const { data: resumen, error: e2 } = await supabase.rpc('get_descuentos_resumen', {
      p_location_id: LOCATION_ID,
    })
    expect(e2).toBeNull()
    expect(resumen?.length).toBe(0)
  }, 15_000)
})

describe.runIf(shouldRunIntegration)('get_descuentos_resumen — tasa_efectiva por canal (agosto 2026 STG)', () => {
  // La RPC no filtra ni excluye ningún canal por nombre (decisión de Tano:
  // esa exclusión vive en la UI). Estos tests verifican el SIGNO de
  // tasa_efectiva para 3 canales conocidos, no el valor exacto -- si mañana
  // cambia la ingesta o se corrige un dato, el test sigue vigente mientras
  // el fenómeno de fondo (recargo de delivery en APLICACIONES) siga siendo
  // real. No se ata a -0,4% ni a ningún monto en pesos.
  let supabase: SupabaseClient
  let agosto: Array<{ tipo_zona: string; tasa_efectiva: number | null }>
  const LOCATION_ID = 'bbbbbbbb-0000-0000-0000-000000000001'

  beforeAll(async () => {
    supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
    const { error: authErr } = await supabase.auth.signInWithPassword({
      email: process.env.QA_OWNER_EMAIL!,
      password: process.env.QA_OWNER_PASSWORD!,
    })
    expect(authErr).toBeNull()

    const { data, error } = await supabase.rpc('get_descuentos_resumen', { p_location_id: LOCATION_ID })
    expect(error).toBeNull()
    agosto = (data ?? []).filter((r: { mes_inicio: string }) => r.mes_inicio === '2026-08-01')
    expect(agosto.length).toBeGreaterThan(0)
  })

  it('APLICACIONES: tasa_efectiva negativa (recargo neto, no descuento)', () => {
    const row = agosto.find(r => r.tipo_zona === 'APLICACIONES')
    expect(row).toBeDefined()
    expect(row!.tasa_efectiva).toBeLessThan(0)
  })

  it('SALON: tasa_efectiva positiva', () => {
    const row = agosto.find(r => r.tipo_zona === 'SALON')
    expect(row).toBeDefined()
    expect(row!.tasa_efectiva).toBeGreaterThan(0)
  })

  it('MOSTRADOR: tasa_efectiva positiva', () => {
    const row = agosto.find(r => r.tipo_zona === 'MOSTRADOR')
    expect(row).toBeDefined()
    expect(row!.tasa_efectiva).toBeGreaterThan(0)
  })
})

describe('tasa_efectiva = (bruto_total - neto_total) / NULLIF(bruto_total, 0) — motor puro', () => {
  // No es una llamada viva a propósito: NULLIF(x, 0) y la división por NULL
  // son semántica estándar de SQL, no comportamiento propio de esta RPC, y
  // no depende de que exista un canal con bruto_total=0 en datos reales de
  // STG (implicaría un mes/canal sin ninguna venta ni cortesía -- no hay
  // ninguno hoy). Réplica fiel de la expresión, mismo patrón que
  // documento-peso.test.ts para documento_peso/documento_es_reverso.
  function tasaEfectiva(brutoTotal: number, netoTotal: number): number | null {
    if (brutoTotal === 0) return null
    return (brutoTotal - netoTotal) / brutoTotal
  }

  it('bruto_total = 0 → NULL, no error ni división por cero', () => {
    expect(tasaEfectiva(0, 0)).toBeNull()
  })

  it('bruto_total > 0 con neto_total = bruto_total → 0 (sin descuento ni recargo)', () => {
    expect(tasaEfectiva(100000, 100000)).toBe(0)
  })
})
