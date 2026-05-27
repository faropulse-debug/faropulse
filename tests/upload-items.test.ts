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

// Mock fetch for items endpoint: returns existingIds from queryExistingIds lookup,
// and ok responses for DELETE, INSERT, freshness calls.
function makeItemsFetchMock(existingIds: string[]) {
  const existingSet = new Set(existingIds)
  return vi.fn().mockImplementation(async (url: unknown, opts?: unknown) => {
    const urlStr = String(url)
    const method = (opts as RequestInit | undefined)?.method ?? 'GET'

    // queryExistingIds: GET sales_items?...&select=external_id
    if (method === 'GET' && urlStr.includes('sales_items') && urlStr.includes('select=external_id')) {
      const match   = urlStr.match(/external_id=([^&]+)/)
      const inClause = match ? decodeURIComponent(match[1]) : ''
      const ids      = inClause.match(/"([^"]+)"/g)?.map(s => s.replace(/"/g, '')) ?? []
      const found    = ids.filter(id => existingSet.has(id))
      return { ok: true, json: async () => found.map(id => ({ external_id: id })), text: async () => '' }
    }

    // queryFreshness: GET data_freshness
    if (method === 'GET' && urlStr.includes('data_freshness')) {
      return {
        ok:   true,
        json: async () => [{ dataset: 'sales_items', last_upload: new Date().toISOString() }],
        text: async () => '',
      }
    }

    // deleteByExternalIds: DELETE sales_items — return representation expected
    if (method === 'DELETE') {
      return { ok: true, json: async () => [], text: async () => '' }
    }

    // insertBatch (POST sales_items) + upsertFreshness (POST data_freshness): just ok
    return { ok: true, json: async () => [], text: async () => '' }
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
    try {
      // Only Sucursal + Numero — missing Descripcion, Cantidad, Precio Total, Fecha Caja, Familia
      const file = makeXlsx([{ Sucursal: 'Casa Central', Numero: '1001' }])
      const { POST } = await import('@/app/api/upload/items/route')
      const req  = makeReq({ items: file, location_id: 'loc-1', org_id: 'org-1' })
      const res  = await POST(req)

      expect(res.status).toBe(422)
      const body = await res.json() as { error: string; message: string; missing: string[] }
      expect(body.error).toBe('FILE_IDENTITY_FAILED')
      expect(body.message).toMatch(/Faltan columnas requeridas/)
      expect(body.missing).toContain('descripcion')
      expect(body.missing).toContain('precio_total')
      expect(body.missing).toContain('fecha_caja')
      expect(body.missing).toContain('familia')
    } finally {
      vi.unstubAllEnvs()
    }
  })
})

describe('POST /api/upload/items — carga de ítems', () => {
  it('carga exitosa con 5 ítems válidos → new=5, updated=0', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://test.supabase.co')
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-key')
    vi.stubGlobal('fetch', makeItemsFetchMock([]))   // no existing records

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
    const ids = Array.from({ length: 5 }, (_, i) => `I-${i + 1}`)
    vi.stubGlobal('fetch', makeItemsFetchMock(ids))  // all 5 already exist

    try {
      const rows = ids.map(id => ({ ...BASE_ITEM, Numero: id }))
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
    vi.stubGlobal('fetch', makeItemsFetchMock([]))

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
