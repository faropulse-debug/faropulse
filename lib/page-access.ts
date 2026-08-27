import type { Role } from '@/types/auth'
import { WRITE_ROLES } from '@/lib/authz'

/**
 * All five roles — the default for dashboard pages that are pure stubs or
 * read-only shells (nothing here writes or exposes financial detail).
 */
export const ALL_DASHBOARD_ROLES: readonly Role[] = ['owner', 'manager', 'encargado', 'super_admin', 'staff']

/**
 * Single source of truth for which roles may LOAD a given /dashboard/* page,
 * looked up server-side by proxy.ts before the page bundle ships. Longest
 * matching prefix wins; a path with no match falls back to ALL_DASHBOARD_ROLES.
 *
 * This answers a different question than:
 *  - TABS.allowedRoles in app/dashboard/owner/v2/page.tsx (which tabs render
 *    once the page has already loaded)
 *  - canAccessModule in app/role-select/page.tsx (which module tiles render)
 * A role can be shown a tab/tile (read) without being allowed to load the
 * page that writes the underlying data — see lib/authz.ts for that split.
 * A role must never be shown a tab/tile for a page it can't load, though:
 * tests/page-access-consistency.test.ts enforces TABS and canAccessModule
 * stay a subset of this table so the two never drift apart in silence.
 *
 * /dashboard/pnl, /dashboard/reconcile, and /dashboard/upload use WRITE_ROLES:
 * loading any of these pages is itself a write-adjacent or financial-audit
 * action, matching the criterion already used to gate /api/pnl and every
 * /api/upload/* route (all call requireMembership(..., { roles: WRITE_ROLES })).
 */
export const PAGE_ACCESS: readonly { prefix: string; roles: readonly Role[] }[] = [
  { prefix: '/dashboard/owner/v2',  roles: ALL_DASHBOARD_ROLES },
  { prefix: '/dashboard/owner',     roles: ALL_DASHBOARD_ROLES },
  { prefix: '/dashboard/manager',   roles: ALL_DASHBOARD_ROLES },
  { prefix: '/dashboard/pnl',       roles: WRITE_ROLES },
  { prefix: '/dashboard/reconcile', roles: WRITE_ROLES },
  { prefix: '/dashboard/upload',    roles: WRITE_ROLES },
  { prefix: '/dashboard/business-config', roles: WRITE_ROLES },
]

export function rolesForPath(pathname: string): readonly Role[] {
  let best: { prefix: string; roles: readonly Role[] } | null = null
  for (const entry of PAGE_ACCESS) {
    if (pathname.startsWith(entry.prefix) && (!best || entry.prefix.length > best.prefix.length)) {
      best = entry
    }
  }
  return best ? best.roles : ALL_DASHBOARD_ROLES
}
