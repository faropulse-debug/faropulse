import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

// ── Supabase mocks ────────────────────────────────────────────────────────────
// memberships.location_id now exists (multi-location migration) and is queried
// directly — no more bridging through locations.org_id. This file previously
// covered an incident where the bridged path was needed; kept as regression
// coverage for the direct-query path.

const { mockGetUser, mockMembershipSingle, mockCreateClient, mockCreateServerClient } =
  vi.hoisted(() => {
    const mockGetUser          = vi.fn()
    const mockMembershipSingle = vi.fn()

    const memChain: Record<string, unknown> = {}
    memChain['select']      = vi.fn(() => memChain)
    memChain['eq']          = vi.fn(() => memChain)
    memChain['maybeSingle'] = mockMembershipSingle

    const mockCreateClient = vi.fn(() => ({
      auth: { getUser: mockGetUser },
      from: vi.fn((table: string) => {
        if (table === 'memberships') return memChain
        throw new Error(`Unexpected table in test: ${table}`)
      }),
    }))

    const mockCreateServerClient = vi.fn(() => ({
      auth: { getUser: mockGetUser },
    }))

    return { mockGetUser, mockMembershipSingle, mockCreateClient, mockCreateServerClient }
  })

vi.mock('@supabase/supabase-js', () => ({ createClient: mockCreateClient }))
vi.mock('@supabase/ssr',          () => ({ createServerClient: mockCreateServerClient }))

// ── Env setup ─────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL',      'https://test.supabase.co')
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'test-anon-key')
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY',     'test-svc-key')
  // clearAllMocks: resets call history without removing chain implementations
  vi.clearAllMocks()
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

  it('403 — location exists but user has no active membership', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-abc' } }, error: null })
    mockMembershipSingle.mockResolvedValue({ data: null, error: null })

    const { requireMembership } = await import('@/lib/api-auth')
    const result = await requireMembership(makeReq(), 'loc-other')

    expect(result).toBeInstanceOf(Response)
    expect((result as Response).status).toBe(403)
    const body = await (result as Response).json()
    expect(body.error).toMatch(/Forbidden/)
  })

  it('200 — valid cookie session + active membership → { userId }', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-abc' } }, error: null })
    mockMembershipSingle.mockResolvedValue({ data: { id: 'mem-1' }, error: null })

    const { requireMembership } = await import('@/lib/api-auth')
    const result = await requireMembership(makeReq(), 'loc-123')

    expect(result).not.toBeInstanceOf(Response)
    expect((result as { userId: string }).userId).toBe('user-abc')
    expect(mockCreateServerClient).toHaveBeenCalled()
  })

  it('200 — valid Bearer JWT + active membership → { userId }', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-xyz' } }, error: null })
    mockMembershipSingle.mockResolvedValue({ data: { id: 'mem-2' }, error: null })

    const { requireMembership } = await import('@/lib/api-auth')
    const result = await requireMembership(makeReq({ bearer: 'real-user-jwt' }), 'loc-123')

    expect(result).not.toBeInstanceOf(Response)
    expect((result as { userId: string }).userId).toBe('user-xyz')
    expect(mockCreateClient).toHaveBeenCalled()
    expect(mockCreateServerClient).not.toHaveBeenCalled()
  })

  it('403 — membership DB error treated as forbidden', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-abc' } }, error: null })
    mockMembershipSingle.mockResolvedValue({ data: null, error: { message: 'connection reset' } })

    const { requireMembership } = await import('@/lib/api-auth')
    const result = await requireMembership(makeReq(), 'loc-123')

    expect(result).toBeInstanceOf(Response)
    expect((result as Response).status).toBe(403)
  })
})
