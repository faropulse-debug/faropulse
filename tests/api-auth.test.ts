import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

// ── Supabase mocks ────────────────────────────────────────────────────────────
// vi.hoisted ensures these are available before vi.mock() factories run.

const { mockGetUser, mockMaybySingle, mockCreateClient, mockCreateServerClient } =
  vi.hoisted(() => {
    const mockGetUser     = vi.fn()
    const mockMaybySingle = vi.fn()

    // Build a reusable chainable query builder mock
    const chain: Record<string, unknown> = {}
    chain['select']      = vi.fn(() => chain)
    chain['eq']          = vi.fn(() => chain)
    chain['maybeSingle'] = mockMaybySingle

    const mockCreateClient = vi.fn(() => ({
      auth: { getUser: mockGetUser },
      from:  vi.fn(() => chain),
    }))

    const mockCreateServerClient = vi.fn(() => ({
      auth: { getUser: mockGetUser },
    }))

    return { mockGetUser, mockMaybySingle, mockCreateClient, mockCreateServerClient }
  })

vi.mock('@supabase/supabase-js', () => ({ createClient: mockCreateClient }))
vi.mock('@supabase/ssr',          () => ({ createServerClient: mockCreateServerClient }))

// ── Env setup ─────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL',  'https://test.supabase.co')
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'test-anon-key')
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-svc-key')
  vi.resetAllMocks()
})

afterEach(() => {
  vi.unstubAllEnvs()
})

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeReq(opts: { bearer?: string } = {}) {
  const headers: Record<string, string> = {}
  if (opts.bearer) headers['authorization'] = `Bearer ${opts.bearer}`
  return new NextRequest('http://localhost/api/test', { method: 'POST', headers })
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('requireMembership', () => {
  it('401 — no session (cookie path, getUser returns null)', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null })

    const { requireMembership } = await import('@/lib/api-auth')
    const result = await requireMembership(makeReq(), 'loc-123')

    expect(result).toBeInstanceOf(Response)
    expect((result as Response).status).toBe(401)
  })

  it('401 — invalid Bearer token', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'JWT expired' },
    })

    const { requireMembership } = await import('@/lib/api-auth')
    const result = await requireMembership(makeReq({ bearer: 'invalid-token' }), 'loc-123')

    expect(result).toBeInstanceOf(Response)
    expect((result as Response).status).toBe(401)
    const body = await (result as Response).json()
    expect(body.error).toBe('Unauthorized')
  })

  it('403 — valid session but no membership in the given location', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-abc' } }, error: null })
    mockMaybySingle.mockResolvedValue({ data: null, error: null })

    const { requireMembership } = await import('@/lib/api-auth')
    const result = await requireMembership(makeReq(), 'loc-other')

    expect(result).toBeInstanceOf(Response)
    expect((result as Response).status).toBe(403)
    const body = await (result as Response).json()
    expect(body.error).toMatch(/Forbidden/)
  })

  it('200 — valid cookie session with active membership returns { userId }', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-abc' } }, error: null })
    mockMaybySingle.mockResolvedValue({ data: { id: 'mem-1' }, error: null })

    const { requireMembership } = await import('@/lib/api-auth')
    const result = await requireMembership(makeReq(), 'loc-123')

    expect(result).not.toBeInstanceOf(Response)
    expect((result as { userId: string }).userId).toBe('user-abc')
  })

  it('200 — valid Bearer JWT with active membership returns { userId }', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-xyz' } }, error: null })
    mockMaybySingle.mockResolvedValue({ data: { id: 'mem-2' }, error: null })

    const { requireMembership } = await import('@/lib/api-auth')
    const result = await requireMembership(makeReq({ bearer: 'real-user-jwt' }), 'loc-123')

    expect(result).not.toBeInstanceOf(Response)
    expect((result as { userId: string }).userId).toBe('user-xyz')
    // Bearer path uses createClient (not createServerClient)
    expect(mockCreateClient).toHaveBeenCalled()
    expect(mockCreateServerClient).not.toHaveBeenCalled()
  })

  it('403 — membership DB error treated as forbidden', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-abc' } }, error: null })
    mockMaybySingle.mockResolvedValue({ data: null, error: { message: 'connection reset' } })

    const { requireMembership } = await import('@/lib/api-auth')
    const result = await requireMembership(makeReq(), 'loc-123')

    expect(result).toBeInstanceOf(Response)
    expect((result as Response).status).toBe(403)
  })
})
