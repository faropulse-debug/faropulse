'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import type { AuthUser, Membership, Role } from '@/types/auth'

const STORAGE_KEY = 'faro_active_membership'

export function useAuth() {
  const [user,      setUser]      = useState<AuthUser | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!session) {
          setUser(null)
          setIsLoading(false)
          return
        }

        const [profileResult, membershipsResult] = await Promise.all([
          supabase
            .from('profiles')
            .select('id, full_name, avatar_url')
            .eq('id', session.user.id)
            .single(),
          supabase
            .from('memberships')
            .select('*, organization:organizations(id, name, slug, plan)')
            .eq('user_id', session.user.id)
            .eq('is_active', true),
        ])

        if (profileResult.error || !profileResult.data) {
          setUser(null)
          setIsLoading(false)
          return
        }

        const memberships = (membershipsResult.data ?? []) as Membership[]

        // Restore the previously chosen membership from localStorage
        const storedId = typeof window !== 'undefined'
          ? localStorage.getItem(STORAGE_KEY)
          : null
        const activeMembership =
          (storedId ? memberships.find(m => m.id === storedId) : null)
          ?? memberships[0]
          ?? null

        setUser({
          profile: {
            ...profileResult.data,
            email: session.user.email ?? '',
          },
          memberships,
          activeMembership,
        })
        setIsLoading(false)
      }
    )

    return () => subscription.unsubscribe()
  }, [])

  // ── Derived values ──────────────────────────────────────────────────────────

  const role: Role | null = user?.activeMembership?.role ?? null
  const isOwner   = role === 'owner'
  const isManager = role === 'manager'

  // ── Actions ─────────────────────────────────────────────────────────────────

  function setActiveMembership(membershipId: string) {
    if (!user) return
    const membership = user.memberships.find(m => m.id === membershipId)
    if (!membership) return

    localStorage.setItem(STORAGE_KEY, membershipId)
    document.cookie = `faro_role=${membership.role}; path=/; max-age=86400; SameSite=Lax`
    setUser({ ...user, activeMembership: membership })
  }

  async function signOut() {
    if (typeof window !== 'undefined') {
      localStorage.removeItem(STORAGE_KEY)
    }
    document.cookie = 'faro_role=; path=/; max-age=0; SameSite=Lax'
    await supabase.auth.signOut()
    setUser(null)
  }

  return { user, isLoading, role, isOwner, isManager, setActiveMembership, signOut }
}
