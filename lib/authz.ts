import type { Role } from '@/types/auth'

/**
 * Single source of truth for which roles may call the mutating API routes
 * (upload/*, /api/pnl) — passed to requireMembership(req, locationId, { roles: WRITE_ROLES }).
 *
 * This answers a different question than the UI-only role lists in
 * app/role-select/page.tsx (canAccessModule) and app/dashboard/owner/v2/page.tsx
 * (TABS.allowedRoles): those control what a role SEES (which module tiles /
 * tabs render). This constant controls what a role is allowed to DO (write).
 * A role can legitimately see a tab it can't write to — e.g. manager sees the
 * P&L tab (TABS.allowedRoles includes 'manager') but cannot submit /api/pnl
 * (not in WRITE_ROLES). That split is intentional, not a bug.
 *
 * If you change this list, check whether canAccessModule / TABS.allowedRoles
 * should change too, so a role is never shown a form it can't actually submit.
 */
export const WRITE_ROLES: readonly Role[] = ['owner', 'super_admin']
