import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { recordEvent } from '@/src/lib/upload/pipeline/recordEvent'

const SUPA_URL  = 'https://stg'
const SVC_KEY   = 'svc-key'
const UUID_RE   = /^[0-9a-f-]{36}$/

describe('recordEvent — INSERT exitoso', () => {
  afterEach(() => { vi.unstubAllGlobals() })

  it('devuelve id + event_id + event_type + created_at', async () => {
    const mockRow = {
      id:         'uuid-result-001',
      event_id:   'uuid-event-001',
      event_type: 'upload.received',
      created_at: '2026-05-25T10:00:00Z',
    }

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok:     true,
      status: 201,
      json:   async () => [mockRow],
      text:   async () => JSON.stringify([mockRow]),
    }))

    const result = await recordEvent(
      { eventType: 'upload.received', contractId: 'maxirest-sales' },
      SUPA_URL,
      SVC_KEY,
    )

    expect(result.id).toBe('uuid-result-001')
    expect(result.event_id).toBe('uuid-event-001')
    expect(result.event_type).toBe('upload.received')
    expect(result.created_at).toBe('2026-05-25T10:00:00Z')
  })
})

describe('recordEvent — generación automática de eventId', () => {
  afterEach(() => { vi.unstubAllGlobals() })

  it('si no se pasa eventId, el body enviado contiene un UUID válido', async () => {
    let capturedBody: Record<string, unknown> = {}

    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (_url: unknown, opts?: RequestInit) => {
      capturedBody = JSON.parse(opts?.body as string ?? '{}')
      return {
        ok:     true,
        status: 201,
        json:   async () => [{ id: 'x', event_id: capturedBody['event_id'], event_type: 'upload.validated', created_at: '' }],
        text:   async () => '',
      }
    }))

    await recordEvent(
      { eventType: 'upload.validated', contractId: 'maxirest-sales' },
      SUPA_URL,
      SVC_KEY,
    )

    expect(typeof capturedBody['event_id']).toBe('string')
    expect(capturedBody['event_id']).toMatch(UUID_RE)
  })
})

describe('recordEvent — eventId explícito se reutiliza', () => {
  afterEach(() => { vi.unstubAllGlobals() })

  it('dos llamadas con el mismo eventId envían el mismo event_id en ambos bodies', async () => {
    const bodies: Record<string, unknown>[] = []

    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (_url: unknown, opts?: RequestInit) => {
      bodies.push(JSON.parse(opts?.body as string ?? '{}'))
      return {
        ok:     true,
        status: 201,
        json:   async () => [{ id: 'x', event_id: 'fixed-uuid-1234', event_type: 'upload.parsed', created_at: '' }],
        text:   async () => '',
      }
    }))

    await recordEvent(
      { eventId: 'fixed-uuid-1234', eventType: 'upload.parsed', contractId: 'maxirest-sales' },
      SUPA_URL,
      SVC_KEY,
    )
    await recordEvent(
      { eventId: 'fixed-uuid-1234', eventType: 'upload.committed', contractId: 'maxirest-sales' },
      SUPA_URL,
      SVC_KEY,
    )

    expect(bodies).toHaveLength(2)
    expect(bodies[0]['event_id']).toBe('fixed-uuid-1234')
    expect(bodies[1]['event_id']).toBe('fixed-uuid-1234')
  })
})

describe('recordEvent — error de Supabase lanza excepción', () => {
  afterEach(() => { vi.unstubAllGlobals() })

  it('status 400 lanza Error con el status y el detalle del body', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok:     false,
      status: 400,
      json:   async () => { throw new Error('not json') },
      text:   async () => 'ERROR detail',
    }))

    await expect(
      recordEvent(
        { eventType: 'upload.received', contractId: 'maxirest-sales' },
        SUPA_URL,
        SVC_KEY,
      ),
    ).rejects.toThrow(/400/)

    await expect(
      recordEvent(
        { eventType: 'upload.received', contractId: 'maxirest-sales' },
        SUPA_URL,
        SVC_KEY,
      ),
    ).rejects.toThrow(/ERROR detail/)
  })
})
