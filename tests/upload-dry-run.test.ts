import { describe, it, expect, vi, afterEach } from 'vitest'
import { runUploadPipeline } from '@/src/lib/upload/pipeline/runPipeline'
import type { DataSourceContract } from '@/src/lib/upload/contracts/types'

// ── Minimal test contract ──────────────────────────────────────────────────────

function makeContract(
  inputRows: Record<string, unknown>[],
  { dateColumn = 'fecha' }: { dateColumn?: string } = {},
): DataSourceContract<Record<string, unknown>> {
  return {
    id:          'test-contract',
    posName:     'Test POS',
    datasetType: 'sales',
    sourceType:  'excel',
    table:       'test_table',
    version:     '1.0.0',
    uiConfig:    { title: 'Test', description: '', icon: '', accentColor: '', order: 0 },
    hashColumn:  'row_hash',
    dateColumn,
    async validate()         { return { ok: true, errors: [], warnings: [] } },
    async *extract()         { for (const r of inputRows) yield r },
    parseRow(raw)            { return (raw as Record<string, unknown>)['__reject'] ? null : raw as Record<string, unknown> },
    computeHash(row)         { return String(row['row_hash'] ?? 'nohash') },
  }
}

function makeFile(): File {
  return new File([new Uint8Array([0x50, 0x4B, 0x03, 0x04])], 'test.xlsx', {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
}

// ── fetch mock builder ─────────────────────────────────────────────────────────

type MockOpts = {
  existingHashes?: string[]
  duplicateEvent?: Record<string, unknown> | null
}

function makeFetchSpy({ existingHashes = [], duplicateEvent = null }: MockOpts = {}) {
  return vi.fn().mockImplementation(async (url: unknown, opts?: unknown) => {
    const urlStr = String(url)
    const method = (opts as RequestInit | undefined)?.method ?? 'GET'

    // queryCommittedByRequestHash: GET upload_events
    if (method === 'GET' && urlStr.includes('upload_events')) {
      if (duplicateEvent) return { ok: true, status: 200, json: async () => [duplicateEvent], text: async () => '' }
      return { ok: true, status: 200, json: async () => [], text: async () => '[]' }
    }
    // queryExistingHashes + verify: GET test_table
    if (method === 'GET' && urlStr.includes('test_table')) {
      return {
        ok:     true,
        status: 200,
        json:   async () => existingHashes.map(h => ({ row_hash: h })),
        text:   async () => '',
      }
    }
    // recordEvent: POST upload_events
    if (method === 'POST' && urlStr.includes('upload_events')) {
      return { ok: true, status: 201, json: async () => [{ id: 'x', event_id: 'event-id', event_type: 'test', created_at: '2026-01-01T00:00:00Z' }], text: async () => '' }
    }
    // Fallback for any other call
    return { ok: true, status: 200, json: async () => [], text: async () => '[]' }
  })
}

const SUPA_URL  = 'https://test.supabase.co'
const SVC_KEY   = 'test-svc-key'
const ORG_ID    = 'org-test'
const LOC_ID    = 'loc-test'

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('dry-run — status dry_run + wouldCommit true', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })

  it('devuelve status=dry_run, wouldCommit=true, counts correctos (new=1, updated=2)', async () => {
    const rows = [
      { row_hash: 'hash-A', fecha: '2026-01-01' },
      { row_hash: 'hash-B', fecha: '2026-01-02' },
      { row_hash: 'hash-C', fecha: '2026-01-03' },
    ]
    // hash-A y hash-B ya existen → updated=2, new=1
    const fetchSpy = makeFetchSpy({ existingHashes: ['hash-A', 'hash-B'] })
    vi.stubGlobal('fetch', fetchSpy)

    const result = await runUploadPipeline(
      makeContract(rows),
      makeFile(),
      ORG_ID, LOC_ID, SUPA_URL, SVC_KEY,
      { dryRun: true },
    )

    expect(result.httpStatus).toBe(200)
    const b = result.body
    expect(b.status).toBe('dry_run')
    expect(b.dryRun).toBe(true)
    expect(b.wouldCommit).toBe(true)
    const counts = b['sales'] as { new: number; updated: number; processed: number; rejected: number; failed: number }
    expect(counts.new).toBe(1)
    expect(counts.updated).toBe(2)
    expect(counts.processed).toBe(3)
    expect(counts.rejected).toBe(0)
    expect(counts.failed).toBe(0)
  })

  it('incluye dateRange calculado en memoria', async () => {
    const rows = [
      { row_hash: 'h1', fecha: '2026-03-01' },
      { row_hash: 'h2', fecha: '2026-03-15' },
      { row_hash: 'h3', fecha: '2026-03-07' },
    ]
    vi.stubGlobal('fetch', makeFetchSpy())

    const result = await runUploadPipeline(
      makeContract(rows, { dateColumn: 'fecha' }),
      makeFile(),
      ORG_ID, LOC_ID, SUPA_URL, SVC_KEY,
      { dryRun: true },
    )

    expect(result.body.dateRange).toBe('2026-03-01 – 2026-03-15')
  })
})

describe('dry-run — NO escribe nada (sin efectos)', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })

  it('NO llama a POST upload_events (recordEvent) en ningún momento', async () => {
    const rows = [{ row_hash: 'h1', fecha: '2026-01-01' }]
    const fetchSpy = makeFetchSpy()
    vi.stubGlobal('fetch', fetchSpy)

    await runUploadPipeline(
      makeContract(rows),
      makeFile(),
      ORG_ID, LOC_ID, SUPA_URL, SVC_KEY,
      { dryRun: true },
    )

    const postToEvents = fetchSpy.mock.calls.filter(([url, opts]) =>
      String(url).includes('upload_events') &&
      ((opts as RequestInit | undefined)?.method ?? 'GET') === 'POST',
    )
    expect(postToEvents).toHaveLength(0)
  })

  it('NO llama a rpc/commit_upload', async () => {
    const rows = [{ row_hash: 'h1', fecha: '2026-01-01' }]
    const fetchSpy = makeFetchSpy()
    vi.stubGlobal('fetch', fetchSpy)

    await runUploadPipeline(
      makeContract(rows),
      makeFile(),
      ORG_ID, LOC_ID, SUPA_URL, SVC_KEY,
      { dryRun: true },
    )

    const commitCalls = fetchSpy.mock.calls.filter(([url]) =>
      String(url).includes('rpc/commit_upload'),
    )
    expect(commitCalls).toHaveLength(0)
  })

  it('NO llama a data_freshness (upsertFreshness)', async () => {
    const rows = [{ row_hash: 'h1', fecha: '2026-01-01' }]
    const fetchSpy = makeFetchSpy()
    vi.stubGlobal('fetch', fetchSpy)

    await runUploadPipeline(
      makeContract(rows),
      makeFile(),
      ORG_ID, LOC_ID, SUPA_URL, SVC_KEY,
      { dryRun: true },
    )

    const freshnessCalls = fetchSpy.mock.calls.filter(([url]) =>
      String(url).includes('data_freshness'),
    )
    expect(freshnessCalls).toHaveLength(0)
  })
})

describe('dry-run — archivo ya cargado → dry_run_duplicate', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })

  it('devuelve status=dry_run_duplicate, wouldCommit=false con counts del evento previo', async () => {
    const cachedEvent = {
      event_id: 'prev-event-uuid',
      payload:  { newCount: 3, updatedCount: 7, failed: 0, requestHash: 'some-hash' },
    }
    const fetchSpy = makeFetchSpy({ duplicateEvent: cachedEvent })
    vi.stubGlobal('fetch', fetchSpy)

    const result = await runUploadPipeline(
      makeContract([{ row_hash: 'h1' }]),
      makeFile(),
      ORG_ID, LOC_ID, SUPA_URL, SVC_KEY,
      { dryRun: true },
    )

    expect(result.httpStatus).toBe(200)
    const b = result.body
    expect(b.status).toBe('dry_run_duplicate')
    expect(b.dryRun).toBe(true)
    expect(b.wouldCommit).toBe(false)
    const counts = b['sales'] as { new: number; updated: number }
    expect(counts.new).toBe(3)
    expect(counts.updated).toBe(7)
  })

  it('dry_run_duplicate NO escribe evento duplicate_skipped', async () => {
    const cachedEvent = {
      event_id: 'prev-event-uuid',
      payload:  { newCount: 2, updatedCount: 1, failed: 0, requestHash: 'some-hash' },
    }
    const fetchSpy = makeFetchSpy({ duplicateEvent: cachedEvent })
    vi.stubGlobal('fetch', fetchSpy)

    await runUploadPipeline(
      makeContract([{ row_hash: 'h1' }]),
      makeFile(),
      ORG_ID, LOC_ID, SUPA_URL, SVC_KEY,
      { dryRun: true },
    )

    const postCalls = fetchSpy.mock.calls.filter(([url, opts]) =>
      String(url).includes('upload_events') &&
      ((opts as RequestInit | undefined)?.method ?? 'GET') === 'POST',
    )
    expect(postCalls).toHaveLength(0)
  })
})

describe('dry-run — filas rechazadas incluidas en rejections', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })

  it('rejections contiene las filas crudas rechazadas (tasa < 5%)', async () => {
    // 21 rows total: 1 rejected → 4.76% < 5% threshold → no abort
    const validRows = Array.from({ length: 20 }, (_, i) => ({
      row_hash: `h${i}`,
      fecha:    '2026-01-01',
    }))
    const rows = [
      ...validRows,
      { row_hash: 'hR', __reject: true, fecha: '2026-01-02' },
    ]
    vi.stubGlobal('fetch', makeFetchSpy())

    const result = await runUploadPipeline(
      makeContract(rows),
      makeFile(),
      ORG_ID, LOC_ID, SUPA_URL, SVC_KEY,
      { dryRun: true },
    )

    expect(result.httpStatus).toBe(200)
    expect(result.body.status).toBe('dry_run')
    const rejections = result.body['rejections'] as unknown[]
    expect(rejections).toHaveLength(1)
    const counts = result.body['sales'] as { rejected: number; processed: number }
    expect(counts.rejected).toBe(1)
    expect(counts.processed).toBe(20)
  })
})

describe('idempotencia (no dry-run) — datos aún presentes → duplicate_skipped', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })

  it('devuelve status=duplicate_skipped con counts del evento previo', async () => {
    const cachedEvent = {
      event_id: 'prev-event-uuid',
      payload:  { newCount: 3, updatedCount: 7, failed: 0, requestHash: 'some-hash' },
    }
    // existingHashes tiene un elemento → verify GET devuelve 1 fila → dataExists=true → short-circuit
    const fetchSpy = makeFetchSpy({ duplicateEvent: cachedEvent, existingHashes: ['any-hash'] })
    vi.stubGlobal('fetch', fetchSpy)

    const result = await runUploadPipeline(
      makeContract([{ row_hash: 'h1' }]),
      makeFile(),
      ORG_ID, LOC_ID, SUPA_URL, SVC_KEY,
    )

    expect(result.httpStatus).toBe(200)
    expect(result.body.status).toBe('duplicate_skipped')
    expect(result.body.success).toBe(true)
    const counts = result.body['sales'] as { new: number; updated: number }
    expect(counts.new).toBe(3)
    expect(counts.updated).toBe(7)
  })

  it('NO llama a rpc/commit_upload cuando los datos están confirmados', async () => {
    const cachedEvent = {
      event_id: 'prev-event-uuid',
      payload:  { newCount: 1, updatedCount: 0, failed: 0, requestHash: 'some-hash' },
    }
    const fetchSpy = makeFetchSpy({ duplicateEvent: cachedEvent, existingHashes: ['any-hash'] })
    vi.stubGlobal('fetch', fetchSpy)

    await runUploadPipeline(
      makeContract([{ row_hash: 'h1' }]),
      makeFile(),
      ORG_ID, LOC_ID, SUPA_URL, SVC_KEY,
    )

    const commitCalls = fetchSpy.mock.calls.filter(([url]) => String(url).includes('rpc/commit_upload'))
    expect(commitCalls).toHaveLength(0)
  })
})

describe('idempotencia (no dry-run) — tabla borrada → reinserta', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })

  it('llama a rpc/commit_upload y devuelve status=committed cuando verify encuentra tabla vacía', async () => {
    const cachedEvent = {
      event_id: 'prev-event-uuid',
      payload:  { newCount: 2, updatedCount: 0, failed: 0, requestHash: 'some-hash' },
    }
    const fetchSpy = vi.fn().mockImplementation(async (url: unknown, opts?: unknown) => {
      const urlStr = String(url)
      const method = (opts as RequestInit | undefined)?.method ?? 'GET'
      if (method === 'POST' && urlStr.includes('upload_events'))
        return { ok: true, status: 201, json: async () => [{ id: 'x', event_id: 'new-event-id', event_type: 'test', created_at: '2026-01-01T00:00:00Z' }], text: async () => '' }
      if (method === 'GET' && urlStr.includes('upload_events'))
        return { ok: true, status: 200, json: async () => [cachedEvent], text: async () => '' }
      if (method === 'GET' && urlStr.includes('test_table'))
        return { ok: true, status: 200, json: async () => [], text: async () => '[]' }
      if (method === 'POST' && urlStr.includes('rpc/commit_upload'))
        return { ok: true, status: 200, json: async () => ({ deleted: 0, inserted: 2 }), text: async () => '' }
      return { ok: true, status: 200, json: async () => [], text: async () => '[]' }
    })
    vi.stubGlobal('fetch', fetchSpy)

    const rows = [{ row_hash: 'h1' }, { row_hash: 'h2' }]
    const result = await runUploadPipeline(
      makeContract(rows),
      makeFile(),
      ORG_ID, LOC_ID, SUPA_URL, SVC_KEY,
    )

    const commitCalls = fetchSpy.mock.calls.filter(([url]) => String(url).includes('rpc/commit_upload'))
    expect(commitCalls).toHaveLength(1)
    expect(result.httpStatus).toBe(200)
    expect(result.body.status).toBe('committed')
  })
})
