import { describe, it, expect } from 'vitest'
import { getRedirectPath } from '@/lib/redirectAfterLogin'
import type { Membership, Role } from '@/types/auth'

function makeMembership(role: Role, id = 'mem-1'): Membership {
  return {
    id,
    user_id: 'user-1',
    org_id: 'org-1',
    location_id: 'loc-1',
    role,
    is_active: true,
    organization: { id: 'org-1', name: 'Org', slug: 'org', plan: 'starter' },
  }
}

describe('getRedirectPath', () => {
  it('0 memberships → /role-select', () => {
    expect(getRedirectPath([])).toBe('/role-select')
  })

  it('1 membership with role owner → /role-select', () => {
    expect(getRedirectPath([makeMembership('owner')])).toBe('/role-select')
  })

  it('1 membership with role encargado → /role-select', () => {
    expect(getRedirectPath([makeMembership('encargado')])).toBe('/role-select')
  })

  it('1 membership with role manager → /role-select', () => {
    expect(getRedirectPath([makeMembership('manager')])).toBe('/role-select')
  })

  it('2 memberships (any role) → /role-select', () => {
    const memberships = [makeMembership('owner', 'mem-1'), makeMembership('manager', 'mem-2')]
    expect(getRedirectPath(memberships)).toBe('/role-select')
  })
})
