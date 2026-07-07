'use client'

import { createContext, useContext, useState, useEffect, useRef } from 'react'
import * as Sentry from '@sentry/nextjs'
import { getSupabase } from '@/lib/supabase'
import type { AuthChangeEvent, Session } from '@supabase/supabase-js'
import { logger } from '@/lib/logger'
import type { AuthUser, Membership, Role } from '@/types/auth'

const STORAGE_KEY    = 'faro_active_membership'
const LOCATION_ERROR = 'No pudimos cargar tu local. Recargá la página.'

const DEV_FALLBACK_LOCATION_ID = 'bbbbbbbb-0000-0000-0000-000000000001'
const DEV_FALLBACK_ORG_ID      = 'aaaaaaaa-0000-0000-0000-000000000001'

// Pure async builder — cancellable via the `cancelled` ref in the effect.
async function buildUser(session: Session, callId: number): Promise<{ user: AuthUser | null; error: string | null }> {
  const supabase = getSupabase()

  const [profileResult, membershipsResult] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, full_name')
      .eq('id', session.user.id)
      .single(),
    supabase
      .from('memberships')
      .select('*, organization:organizations(id, name, slug, plan)')
      .eq('user_id', session.user.id)
      .eq('is_active', true),
  ])

  if (profileResult.error || !profileResult.data) {
    logger.error('[AuthProvider] profile query failed:', profileResult.error?.message)
    return { user: null, error: null }
  }

  const memberships = (membershipsResult.data ?? []) as Membership[]

  const storedId = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null
  const activeMembership =
    (storedId ? memberships.find(m => m.id === storedId && m.location_id) : null)
    ?? memberships.find(m => m.location_id)
    ?? null

  if (memberships.length > 0 && !activeMembership) {
    logger.error('[AuthProvider] memberships exist but none resolved a location_id')
    return {
      user: {
        profile: { ...profileResult.data, email: session.user.email ?? '' },
        memberships,
        activeMembership: null,
      },
      error: LOCATION_ERROR,
    }
  }

  return {
    user: {
      profile: { ...profileResult.data, email: session.user.email ?? '' },
      memberships,
      activeMembership,
    },
    error: null,
  }
}

// ── Context ──────────────────────────────────────────────────────────────────

export interface AuthContextValue {
  user:                AuthUser | null
  isLoading:           boolean
  error:               string | null
  role:                Role | null
  isOwner:             boolean
  isManager:           boolean
  /** Resolved location_id of the active membership. Includes DEV fallback in development. */
  locationId:          string | null
  /** Resolved org_id of the active membership. Includes DEV fallback in development. */
  orgId:               string | null
  setActiveMembership: (membershipId: string) => void
  signOut:             () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

// ── Provider ─────────────────────────────────────────────────────────────────
//
// Mount this ONCE at the root — it owns the single onAuthStateChange subscription
// and persists across client-side navigations, giving every page a stable shared
// auth state with zero redundant buildUser calls.
//
// Guarantees (identical to former useAuth hook):
//   • isLoading drops to false exactly once (INITIAL_SESSION, SIGNED_OUT, or 8s failsafe)
//   • Null session on any event other than SIGNED_OUT / INITIAL_SESSION is treated as
//     transient and never clears a valid user already in state
//   • TOKEN_REFRESHED with a valid user already loaded skips buildUser
//   • setUser never degrades: if prev has activeMembership and built does not, prev is kept
//     (with a Sentry warning so we can investigate the underlying cause)
//
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user,      setUser]      = useState<AuthUser | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error,     setError]     = useState<string | null>(null)
  const initializedRef = useRef(false)
  const userRef        = useRef<AuthUser | null>(null)

  useEffect(() => {
    let cancelled = false
    let buildCallCount = 0

    const failsafe = setTimeout(() => {
      if (!initializedRef.current) {
        logger.warn('[AuthProvider] failsafe — INITIAL_SESSION never received in 8s')
        setIsLoading(false)
      }
    }, 8_000)

    const { data: { subscription } } = getSupabase().auth.onAuthStateChange(
      // NOT async — must return void synchronously so @supabase/auth-js v2's
      // _notifyAllSubscribers() gets an immediate return and signInWithPassword()
      // resolves without waiting for our DB queries (avoids the blocking deadlock).
      (event: AuthChangeEvent, session: Session | null) => {
        if (cancelled) return
        logger.debug('[AuthProvider]', event, session ? 'session OK' : 'session null')

        if (event === 'SIGNED_OUT') {
          userRef.current = null
          setUser(null)
          setError(null)
          setIsLoading(false)
          initializedRef.current = true
          clearTimeout(failsafe)
          return
        }

        if (event === 'INITIAL_SESSION' && !session) {
          userRef.current = null
          setUser(null)
          setError(null)
          setIsLoading(false)
          initializedRef.current = true
          clearTimeout(failsafe)
          return
        }

        if (!session) {
          logger.warn('[AuthProvider] null session on', event, '— ignoring, preserving user')
          if (!initializedRef.current) {
            setIsLoading(false)
            initializedRef.current = true
            clearTimeout(failsafe)
          }
          return
        }

        if (event === 'TOKEN_REFRESHED' && userRef.current?.activeMembership) {
          if (!initializedRef.current) {
            setIsLoading(false)
            initializedRef.current = true
            clearTimeout(failsafe)
          }
          return
        }

        // Capture callId synchronously before deferring so ordering is preserved
        // across rapid consecutive events.
        const callId = ++buildCallCount
        queueMicrotask(async () => {
          if (cancelled) return

          const { user: built, error: buildError } = await buildUser(session, callId)
          if (cancelled) return

          if (built !== null) {
            setUser(prev => {
              if (prev?.activeMembership && !built.activeMembership) {
                Sentry.captureMessage('[AuthProvider] activeMembership dropped to null after auth event — keeping previous', {
                  level: 'warning',
                  extra: { event, userId: built.profile.id },
                })
                userRef.current = prev
                return prev
              }
              userRef.current = built
              return built
            })
            setError(buildError)
          } else if (!initializedRef.current) {
            userRef.current = null
            setUser(null)
            setError(null)
          }

          setIsLoading(false)
          initializedRef.current = true
          clearTimeout(failsafe)
        })
      }
    )

    return () => {
      cancelled = true
      subscription.unsubscribe()
      clearTimeout(failsafe)
    }
  }, [])

  // ── Derived values ──────────────────────────────────────────────────────────

  const role: Role | null = user?.activeMembership?.role ?? null
  const isOwner   = role === 'owner'
  const isManager = role === 'manager'

  const isDev    = process.env.NODE_ENV === 'development'
  const locationId = user?.activeMembership?.location_id ?? (isDev ? DEV_FALLBACK_LOCATION_ID : null)
  const orgId      = user?.activeMembership?.org_id      ?? (isDev ? DEV_FALLBACK_ORG_ID      : null)

  // ── Actions ─────────────────────────────────────────────────────────────────

  function setActiveMembership(membershipId: string) {
    if (!user) return
    const membership = user.memberships.find(m => m.id === membershipId)
    if (!membership) return
    localStorage.setItem(STORAGE_KEY, membershipId)
    document.cookie = `faro_role=${membership.role}; path=/; max-age=86400; SameSite=Lax`
    const next = { ...user, activeMembership: membership }
    userRef.current = next
    setUser(next)
  }

  async function signOut() {
    if (typeof window !== 'undefined') {
      localStorage.removeItem(STORAGE_KEY)
    }
    document.cookie = 'faro_role=; path=/; max-age=0; SameSite=Lax'
    await getSupabase().auth.signOut()
    userRef.current = null
    setUser(null)
    setError(null)
  }

  return (
    <AuthContext.Provider value={{
      user, isLoading, error,
      role, isOwner, isManager,
      locationId, orgId,
      setActiveMembership, signOut,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>')
  return ctx
}
