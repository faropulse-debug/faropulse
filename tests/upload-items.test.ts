import { describe, it, expect, vi } from 'vitest'
import type { NextRequest } from 'next/server'
import * as XLSX from 'xlsx'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeXlsx(rows: Record<string, unknown>[], sheetName = 'Sheet1'): File {
  const ws = XLSX.utils.json_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, sheetName)
  const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
  return new File([buf], 'test.xlsx', {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
}

function makeReq(fields: Record<string, string | File | null>): NextRequest {
  return {
    formData: async () => ({ get: (k: string) => fields[k] ?? null }),
  } as unknown as NextRequest
}

// Mock fetch for items endpoint: handles all pipeline calls (recordEvent, idempotency,
// queryExistingHashes, commitUpload RPC, freshness).
// reflectAll=true  → returns every queried item_hash as existing (simulates re-upload).
// reflectAll=false → returns nothing (simulates first upload).
function makeItemsFetchMock(reflectAll: boolean) {
  return vi.fn().mockImplementation(async (url: unknown, opts?: unknown) => {
    const urlStr = String(url)
    const method = (opts as RequestInit | undefined)?.method ?? 'GET'

    // recordEvent: POST upload_events → 201 + event row
    if (method === 'POST' && urlStr.includes('upload_events')) {
      return { ok: true, status: 201, json: async () => [{ id: 'x', event_id: 'test-event-id', event_type: 'test', created_at: '2026-01-01T00:00:00Z' }], text: async () => '' }
    }
    // queryCommittedByRequestHash: GET upload_events → no cache
    if (method === 'GET' && urlStr.includes('upload_events')) {
      return { ok: true, status: 200, json: async () => [], text: async () => '[]' }
    }
    // queryExistingHashes: GET sales_items?...&select=item_hash
    if (method === 'GET' && urlStr.includes('sales_items') && urlStr.includes('select=item_hash')) {
      if (!reflectAll) return { ok: true, status: 200, json: async () => [], text: async () => '[]' }
      const match    = urlStr.match(/item_hash=([^&]+)/)
      const inClause = match ? decodeURIComponent(match[1]) : ''
      const hashes   = inClause.match(/"([^"]+)"/g)?.map(s => s.replace(/"/g, '')) ?? []
      return { ok: true, status: 200, json: async () => hashes.map(h => ({ item_hash: h })), text: async () => '' }
    }
    // commitUpload RPC
    if (method === 'POST' && urlStr.includes('rpc/commit_upload')) {
      return { ok: true, status: 200, json: async () => ({ deleted: 0, inserted: 0 }), text: async () => '' }
    }
    // Default (upsertFreshness, data_freshness GET/POST, etc.)
    return { ok: true, status: 200, json: async () => [], text: async () => '[]' }
  })
}

// Minimal valid items row — has all 7 required columns for validateFileIdentity
const BASE_ITEM = {
  Sucursal:       'Casa Central',
  Descripcion:    'Coca Cola',
  Cantidad:       '1',
  'Precio Total': '250',
  'Fecha Caja':   '2025-06-15',
  Familia:        'BEBIDAS',
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('POST /api/upload/items — validación de identidad de archivo', () => {
  it('rechaza archivo sin columnas requeridas → 422 FILE_IDENTITY_FAILED', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://test.supabase.co')
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-key')
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: unknown, opts?: unknown) => {
      const method = (opts as RequestInit | undefined)?.method ?? 'GET'
      if (method === 'POST') return { ok: true, status: 201, json: async () => [{ id: 'x', event_id: 'test-id', event_type: 'test', created_at: '2026-01-01T00:00:00Z' }], text: async () => '' }
      return { ok: true, status: 200, json: async () => [], text: async () => '[]' }
    }))
    try {
      // Only Sucursal + Numero — missing Descripcion, Cantidad, Precio Total, Fecha Caja, Familia
      const file = makeXlsx([{ Sucursal: 'Casa Central', Numero: '1001' }])
      const { POST } = await import('@/app/api/upload/items/route')
      const req  = makeReq({ items: file, location_id: 'loc-1', org_id: 'org-1' })
      const res  = await POST(req)

      expect(res.status).toBe(422)
      const body = await res.json() as { error: string; errors: string[] }
      expect(body.error).toBe('VALIDATION_FAILED')
      expect(body.errors[0]).toMatch(/Faltan columnas requeridas/)
      expect(body.errors[0]).toContain('descripcion')
      expect(body.errors[0]).toContain('fecha_caja')
    } finally {
      vi.unstubAllGlobals()
      vi.unstubAllEnvs()
    }
  })
})

describe('POST /api/upload/items — carga de ítems', () => {
  it('carga exitosa con 5 ítems válidos → new=5, updated=0', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://test.supabase.co')
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-key')
    vi.stubGlobal('fetch', makeItemsFetchMock(false))  // no existing records

    try {
      const rows = Array.from({ length: 5 }, (_, i) => ({ ...BASE_ITEM, Numero: `I-${i + 1}` }))
      const file = makeXlsx(rows)
      const { POST } = await import('@/app/api/upload/items/route')
      const req  = makeReq({ items: file, location_id: 'loc-1', org_id: 'org-1' })
      const res  = await POST(req)

      expect(res.status).toBe(200)
      const body = await res.json() as {
        success: boolean
        items:   { processed: number; new: number; updated: number; rejected: number }
      }
      expect(body.success).toBe(true)
      expect(body.items.processed).toBe(5)
      expect(body.items.new).toBe(5)
      expect(body.items.updated).toBe(0)
      expect(body.items.rejected).toBe(0)
    } finally {
      vi.unstubAllGlobals()
      vi.unstubAllEnvs()
    }
  })

  it('re-carga del mismo archivo → new=0, updated=5 (mock queryExistingIds)', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://test.supabase.co')
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-key')
    vi.stubGlobal('fetch', makeItemsFetchMock(true))  // reflect all item_hashes as existing

    try {
      const rows = Array.from({ length: 5 }, (_, i) => ({ ...BASE_ITEM, Numero: `I-${i + 1}` }))
      const file = makeXlsx(rows)
      const { POST } = await import('@/app/api/upload/items/route')
      const req  = makeReq({ items: file, location_id: 'loc-1', org_id: 'org-1' })
      const res  = await POST(req)

      expect(res.status).toBe(200)
      const body = await res.json() as {
        success: boolean
        items:   { new: number; updated: number }
      }
      expect(body.success).toBe(true)
      expect(body.items.new).toBe(0)
      expect(body.items.updated).toBe(5)
    } finally {
      vi.unstubAllGlobals()
      vi.unstubAllEnvs()
    }
  })
})

describe('POST /api/upload/items — campo ventas ignorado', () => {
  it('si llega también ventas en formData, lo ignora silenciosamente y solo procesa items', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://test.supabase.co')
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-key')
    vi.stubGlobal('fetch', makeItemsFetchMock(false))

    try {
      const itemsFile  = makeXlsx([{ ...BASE_ITEM, Numero: 'I-1' }])
      // ventas file with ventas-shaped columns — endpoint must never read it
      const ventasFile = makeXlsx([{
        Sucursal: 'X', Numero: 'V-1', Fecha: '2025-06-15',
        'Fecha Caja': '2025-06-15', Total: '1000',
        Comensales: '4', 'Tipo Documento': 'TICKET',
      }])
      const { POST } = await import('@/app/api/upload/items/route')
      const req = makeReq({ items: itemsFile, ventas: ventasFile, location_id: 'loc-1', org_id: 'org-1' })
      const res = await POST(req)

      expect(res.status).toBe(200)
      const body = await res.json() as {
        success:   boolean
        items:     { processed: number }
        documents?: unknown
      }
      expect(body.success).toBe(true)
      expect(body.items.processed).toBe(1)          // only items were processed
      expect(body.documents).toBeUndefined()         // no documents field in items endpoint
    } finally {
      vi.unstubAllGlobals()
      vi.unstubAllEnvs()
    }
  })
})

describe('POST /api/upload/items — item_hash discrimina duplicados', () => {
  it('ticket con 2× el mismo ítem → processed=2, new=2 (occurrence 0 y 1 generan hashes distintos)', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://test.supabase.co')
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-key')
    vi.stubGlobal('fetch', makeItemsFetchMock(false))  // no existing records

    try {
      // Two rows with identical content in the same ticket.
      // enrichRows assigns occurrence=0 to the first and occurrence=1 to the second,
      // producing two distinct item_hashes — neither is discarded.
      const rows = [
        { ...BASE_ITEM, Numero: 'T-001' },
        { ...BASE_ITEM, Numero: 'T-001' },
      ]
      const file = makeXlsx(rows)
      const { POST } = await import('@/app/api/upload/items/route')
      const req  = makeReq({ items: file, location_id: 'loc-1', org_id: 'org-1' })
      const res  = await POST(req)

      expect(res.status).toBe(200)
      const body = await res.json() as {
        success: boolean
        items:   { processed: number; new: number; updated: number; rejected: number }
      }
      expect(body.success).toBe(true)
      expect(body.items.processed).toBe(2)
      expect(body.items.new).toBe(2)
      expect(body.items.updated).toBe(0)
      expect(body.items.rejected).toBe(0)
    } finally {
      vi.unstubAllGlobals()
      vi.unstubAllEnvs()
    }
  })
})
