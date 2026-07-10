import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

// ── Supabase mocks ────────────────────────────────────────────────────────────
// createServerClient → session check (auth.getUser)
// createClient       → DB membership check with service role

const { mockGetUser, mockMembershipSingle, mockCreateClient, mockCreateServerClient } =
  vi.hoisted(() => {
    const mockGetUser          = vi.fn()
    const mockMembershipSingle = vi.fn()

    const memChain: Record<string, unknown> = {}
    memChain['select'] = vi.fn(() => memChain)
    memChain['eq']     = vi.fn(() => memChain)
    memChain['limit']  = mockMembershipSingle

    const mockCreateClient = vi.fn(() => ({
      from: vi.fn((table: string) => {
        if (table === 'memberships') return memChain
        throw new Error(`Unexpected table in middleware test: ${table}`)
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
  vi.clearAllMocks()
})

afterEach(() => {
  vi.unstubAllEnvs()
})

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeReq(pathname: string, cookies: Record<string, string> = {}) {
  const cookieHeader = Object.entries(cookies)
    .map(([k, v]) => `${k}=${v}`)
    .join('; ')
  const headers: HeadersInit = cookieHeader ? { cookie: cookieHeader } : {}
  return new NextRequest(`http://localhost${pathname}`, { method: 'GET', headers })
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('middleware — role cookie server-side validation', () => {
  it('1. forged faro_role=owner without DB membership → redirect /role-select + clear cookie', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-abc' } }, error: null })
    mockMembershipSingle.mockResolvedValue({ data: [], error: null })

    const { proxy } = await import('@/proxy')
    const res = await proxy(makeReq('/dashboard/owner/overview', { faro_role: 'owner' }))

    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toContain('/role-select')
    // Cookie value matched path, so DB was queried (not fast-path)
    expect(mockCreateClient).toHaveBeenCalled()
    // Forged cookie must be cleared (maxAge 0)
    const setCookie = res.headers.get('set-cookie') ?? ''
    expect(setCookie).toMatch(/faro_role=;/)
    expect(setCookie).toMatch(/[Mm]ax-[Aa]ge=0/)
  })

  it('2. valid faro_role=owner + active owner membership in DB → passes through (200)', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-abc' } }, error: null })
    mockMembershipSingle.mockResolvedValue({ data: [{ id: 'mem-1' }], error: null })

    const { proxy } = await import('@/proxy')
    const res = await proxy(makeReq('/dashboard/owner/overview', { faro_role: 'owner' }))

    expect(res.status).toBe(200)
    expect(mockCreateClient).toHaveBeenCalled()
  })

  it('3. faro_role inválido/desconocido on /dashboard/owner → fast-path redirect, no DB call', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-abc' } }, error: null })
    // mockMembershipSingle intentionally not set — DB must not be reached

    const { proxy } = await import('@/proxy')
    const res = await proxy(makeReq('/dashboard/owner/overview', { faro_role: 'intruso' }))

    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toContain('/role-select')
    expect(mockCreateClient).not.toHaveBeenCalled()
    expect(mockMembershipSingle).not.toHaveBeenCalled()
  })

  it('4. no session on /dashboard/owner → redirect /login, no DB call', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null })

    const { proxy } = await import('@/proxy')
    const res = await proxy(makeReq('/dashboard/owner/overview'))

    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toContain('/login')
    expect(mockCreateClient).not.toHaveBeenCalled()
  })
})
