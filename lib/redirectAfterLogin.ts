import type { Membership } from '@/types/auth'

/**
 * Determines where to send a user after a successful login,
 * based on their active memberships.
 */
export function getRedirectPath(_memberships: Membership[]): string {
  // Always land on role-select, even with a single membership — the user
  // picks their local every time (Netflix-style), for identity and context.
  return '/role-select'
}
