import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

// requireMembership ya tiene su propia cobertura exhaustiva en
// tests/api-auth.test.ts (401/403/200, opts.roles). Acá se mockea
// directamente para probar SOLO lo que este route agrega encima:
// validación de entries + forma del upsert — no se reimplementa el gate.
const { mockRequireMembership, mockFetch } = vi.hoisted(() => ({
  mockRequireMembership: vi.fn(),
  mockFetch: vi.fn(),
}))

vi.mock('@/lib/api-auth', () => ({ requireMembership: mockRequireMembership }))

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL',  'https://test.supabase.co')
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-svc-key')
  vi.clearAllMocks()
  mockRequireMembership.mockResolvedValue({ userId: 'user-owner' })
  mockFetch.mockResolvedValue(new Response(null, { status: 200 }))
  vi.stubGlobal('fetch', mockFetch)
})

afterEach(() => {
  vi.unstubAllEnvs()
})

function makeReq(locationId: string | null, body: unknown) {
  const url = locationId
    ? `http://localhost/api/business-config?location_id=${locationId}`
    : 'http://localhost/api/business-config'
  return new NextRequest(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/business-config', () => {
  it('400 — falta location_id', async () => {
    const { POST } = await import('@/app/api/business-config/route')
    const res = await POST(makeReq(null, { entries: [{ key: 'benchmark_laboral_pct', value: 30 }] }))
    expect(res.status).toBe(400)
    expect(mockRequireMembership).not.toHaveBeenCalled()
  })

  it('delega el gate de rol a requireMembership con opts.roles = WRITE_ROLES', async () => {
    const { WRITE_ROLES } = await import('@/lib/authz')
    const { POST } = await import('@/app/api/business-config/route')
    await POST(makeReq('loc-1', { entries: [{ key: 'benchmark_laboral_pct', value: 30 }] }))

    expect(mockRequireMembership).toHaveBeenCalledWith(
      expect.anything(),
      'loc-1',
      { roles: WRITE_ROLES },
    )
  })

  it('propaga el rechazo de requireMembership (p.ej. 403 por rol no permitido) sin llegar a escribir', async () => {
    mockRequireMembership.mockResolvedValue(
      new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 }),
    )
    const { POST } = await import('@/app/api/business-config/route')
    const res = await POST(makeReq('loc-1', { entries: [{ key: 'benchmark_laboral_pct', value: 30 }] }))

    expect(res.status).toBe(403)
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('400 — entries vacío o ausente', async () => {
    const { POST } = await import('@/app/api/business-config/route')
    const res = await POST(makeReq('loc-1', {}))
    expect(res.status).toBe(400)
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('400 — key desconocida, no escribe nada', async () => {
    const { POST } = await import('@/app/api/business-config/route')
    const res = await POST(makeReq('loc-1', { entries: [{ key: 'no_existe', value: 1 }] }))
    expect(res.status).toBe(400)
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('400 — valor fuera de rango para la unidad de la key, no escribe nada', async () => {
    const { POST } = await import('@/app/api/business-config/route')
    // benchmark_laboral_pct es 'pct' (0-100) — 150 está fuera de rango.
    const res = await POST(makeReq('loc-1', { entries: [{ key: 'benchmark_laboral_pct', value: 150 }] }))
    expect(res.status).toBe(400)
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('400 — un batch con UNA entrada inválida no escribe NINGUNA (todo o nada)', async () => {
    const { POST } = await import('@/app/api/business-config/route')
    const res = await POST(makeReq('loc-1', {
      entries: [
        { key: 'benchmark_laboral_pct', value: 30 },   // válida
        { key: 'mc_objetivo_pct', value: 15 },          // inválida: ratio espera 0-1, no 15
      ],
    }))
    expect(res.status).toBe(400)
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('200 — batch válido: upsert vía service_role con on_conflict=location_id,key y merge-duplicates', async () => {
    const { POST } = await import('@/app/api/business-config/route')
    const res = await POST(makeReq('loc-1', {
      entries: [
        { key: 'benchmark_laboral_pct', value: 32 },
        { key: 'mc_objetivo_pct', value: 0.15 },
      ],
    }))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.upserted).toEqual(['benchmark_laboral_pct', 'mc_objetivo_pct'])

    expect(mockFetch).toHaveBeenCalledTimes(1)
    const [url, init] = mockFetch.mock.calls[0]
    expect(String(url)).toContain('/rest/v1/location_business_config')
    expect(String(url)).toContain('on_conflict=location_id,key')
    expect(init.headers['Prefer']).toContain('resolution=merge-duplicates')

    interface SentRow { location_id: string; key: string; unit: string; updated_by: string; updated_at: string }
    const sentRows = JSON.parse(init.body) as SentRow[]
    expect(sentRows).toHaveLength(2)
    for (const row of sentRows) {
      expect(row.location_id).toBe('loc-1')
      expect(row.updated_by).toBe('user-owner')
      expect(typeof row.updated_at).toBe('string')
    }
    expect(sentRows.find(r => r.key === 'benchmark_laboral_pct')?.unit).toBe('pct')
    expect(sentRows.find(r => r.key === 'mc_objetivo_pct')?.unit).toBe('ratio')
  })

  it('500 — el upsert falla en Postgres/PostgREST', async () => {
    mockFetch.mockResolvedValue(new Response('db error', { status: 500 }))
    const { POST } = await import('@/app/api/business-config/route')
    const res = await POST(makeReq('loc-1', { entries: [{ key: 'benchmark_laboral_pct', value: 30 }] }))
    expect(res.status).toBe(500)
  })
})
