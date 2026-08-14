import { describe, it, expect } from 'vitest'
import type { Role } from '@/types/auth'
import { ALL_DASHBOARD_ROLES, rolesForPath } from '@/lib/page-access'
import { TABS } from '@/app/dashboard/owner/v2/page'
import { MODULES, canAccessModule } from '@/app/role-select/page'

// Guards the two UI-visibility layers (which tabs/tiles render) against
// silently drifting ahead of lib/page-access.ts (which pages a role may
// actually load, enforced server-side by proxy.ts). If either layer shows
// a role a tab/tile for a page it would be redirected away from, that's a
// broken link in the product, not just an inconsistency — this test fails
// the build before it ships.

function isSubset(a: readonly Role[], b: readonly Role[]): boolean {
  return a.every(role => b.includes(role))
}

describe('page-access consistency', () => {
  it('every TABS.allowedRoles is a subset of PAGE_ACCESS for /dashboard/owner/v2', () => {
    const pageRoles = rolesForPath('/dashboard/owner/v2')

    for (const tab of TABS) {
      expect(
        isSubset(tab.allowedRoles, pageRoles),
        `tab "${tab.key}" allows [${tab.allowedRoles}] but /dashboard/owner/v2 only allows [${pageRoles}]`,
      ).toBe(true)
    }
  })

  it('canAccessModule is a subset of PAGE_ACCESS for the route each module tile links to', () => {
    for (const mod of MODULES) {
      const targetPath = mod.href.split('?')[0]
      const pageRoles = rolesForPath(targetPath)
      const rolesShownAsEnabled = ALL_DASHBOARD_ROLES.filter(role => canAccessModule(role, mod.key))

      expect(
        isSubset(rolesShownAsEnabled, pageRoles),
        `module "${mod.key}" (${mod.href}) shows as enabled for [${rolesShownAsEnabled}] but ${targetPath} only allows [${pageRoles}]`,
      ).toBe(true)
    }
  })
})
