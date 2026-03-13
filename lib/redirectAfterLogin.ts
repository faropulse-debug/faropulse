import type { Membership } from '@/types/auth'

/**
 * Determines where to send a user after a successful login,
 * based on their active memberships.
 */
export function getRedirectPath(memberships: Membership[]): string {
  if (memberships.length === 0) {
    return '/onboarding'
  }

  if (memberships.length === 1) {
    const { role } = memberships[0]
    // Only managers go directly to their dashboard.
    // Owners always land on role-select so they can choose their perspective.
    if (role === 'manager') return '/dashboard/manager'
    return '/role-select'
  }

  // Multiple memberships → always let the user pick
  return '/role-select'
}
