import type { Membership } from '@/types/auth'

/**
 * Determines where to send a user after a successful login,
 * based on their active memberships.
 */
export function getRedirectPath(memberships: Membership[]): string {
  if (memberships.length === 0) {
    return '/role-select'
  }

  if (memberships.length === 1) {
    // Any single role goes straight to the dashboard; tab visibility
    // is filtered per role once there.
    return '/dashboard/owner/v2'
  }

  // Multiple memberships → always let the user pick
  return '/role-select'
}
