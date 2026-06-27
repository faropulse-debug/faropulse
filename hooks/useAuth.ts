'use client'

import { useState, useEffect, useRef } from 'react'
import { getSupabase } from '@/lib/supabase'
import type { AuthChangeEvent, Session } from '@supabase/supabase-js'
import { logger } from '@/lib/logger'
import type { AuthUser, Membership, Role } from '@/types/auth'

const STORAGE_KEY    = 'faro_active_membership'
const LOCATION_ERROR = 'No pudimos cargar tu local. Recargá la página.'

let authInstanceSeq = 0

// Pure async builder — cancellable via the `cancelled` ref in the effect.
// Returns { user, error }:
//   user  = null only when profile fetch fails (irrecoverable at this level)
//   error = non-null only when memberships exist but no location_id resolved
async function buildUser(session: Session, _callId: number): Promise<{ user: AuthUser | null; error: string | null }> {
  const supabase = getSupabase()
  // eslint-disable-next-line no-console
  console.log(`[DIAG:useAuth] buildUser #${_callId} start — uid:${session.user.id}`)

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
    logger.error('[useAuth] profile query failed:', profileResult.error?.message)
    // eslint-disable-next-line no-console
    console.log(`[DIAG:useAuth] buildUser #${_callId} profile failed`, {
      error: profileResult.error?.message ?? null,
    })
    return { user: null, error: null }
  }

  const rawMemberships = (membershipsResult.data ?? []) as Omit<Membership, 'location_id'>[]
  const orgIds = [...new Set(rawMemberships.map(m => m.org_id))]
  // eslint-disable-next-line no-console
  console.log(`[DIAG:useAuth] buildUser #${_callId} memberships`, {
    error: membershipsResult.error?.message ?? null,
    rawMemberships: rawMemberships.map(m => ({
      id: m.id,
      org_id: m.org_id,
      role: m.role,
      is_active: m.is_active,
    })),
    orgIds,
  })

  let locationByOrg: Record<string, string> = {}
  if (orgIds.length > 0) {
    const fetchLocs = () =>
      supabase.from('locations').select('id, org_id').in('org_id', orgIds)

    let { data: locs, error: locsError } = await fetchLocs()
    if (locsError) {
      logger.warn('[useAuth] locations query failed, retrying:', locsError.message)
      ;({ data: locs, error: locsError } = await fetchLocs())
      if (locsError) {
        logger.error('[useAuth] locations query failed after retry:', locsError.message)
      }
    }
    locationByOrg = Object.fromEntries(
      (locs ?? []).map((l: { id: unknown; org_id: unknown }) => [l.org_id as string, l.id as string])
    )
    // eslint-disable-next-line no-console
    console.log(`[DIAG:useAuth] buildUser #${_callId} locations`, {
      error: locsError?.message ?? null,
      rows: (locs ?? []).map((l: { id: unknown; org_id: unknown }) => ({
        id: l.id,
        org_id: l.org_id,
      })),
      locationByOrg,
    })
  }

  const memberships: Membership[] = rawMemberships.map(m => ({
    ...m,
    location_id: locationByOrg[m.org_id],
  }))

  const storedId = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null
  const activeMembership =
    (storedId ? memberships.find(m => m.id === storedId && m.location_id) : null)
    ?? memberships.find(m => m.location_id)
    ?? null

  // eslint-disable-next-line no-console
  console.log(`[DIAG:useAuth] buildUser #${_callId} result`, {
    storedId,
    mappedMemberships: memberships.map(m => ({
      id: m.id,
      org_id: m.org_id,
      role: m.role,
      location_id: m.location_id ?? null,
    })),
    activeMembership: activeMembership
      ? {
          id: activeMembership.id,
          org_id: activeMembership.org_id,
          role: activeMembership.role,
          location_id: activeMembership.location_id ?? null,
        }
      : null,
  })

  // Memberships exist but none resolved a location_id → data/network error, surface it
  if (rawMemberships.length > 0 && !activeMembership) {
    logger.error('[useAuth] memberships exist but none resolved a location_id')
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

// ── Hook contract ────────────────────────────────────────────────────────────
//
//   user         AuthUser | null   null = not logged in OR profile load failed
//   isLoading    boolean           true until INITIAL_SESSION processed or failsafe fires
//   error        string | null     non-null only when memberships exist but no location resolved
//   role         Role | null       derived from user.activeMembership.role
//   isOwner      boolean
//   isManager    boolean
//   setActiveMembership  (membershipId: string) => void
//   signOut              () => Promise<void>
//
// Guarantees:
//   • isLoading drops to false exactly once (INITIAL_SESSION, SIGNED_OUT, or 8s failsafe)
//   • A null session on any event other than SIGNED_OUT / INITIAL_SESSION is treated as
//     transient and never clears a valid user already in state
//   • TOKEN_REFRESHED with a valid user already loaded skips buildUser — token rotation
//     doesn't change profile/memberships/locations and rebuilding causes a race where
//     the second buildUser can receive empty memberships and overwrite a valid activeMembership
//   • setUser never degrades: if prev has activeMembership and built does not, prev is kept
// ─────────────────────────────────────────────────────────────────────────────

export function useAuth() {
  const [user,      setUser]      = useState<AuthUser | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error,     setError]     = useState<string | null>(null)
  const initializedRef = useRef(false)
  // userRef mirrors user state synchronously so the callback closure always sees
  // the latest committed user without stale-closure issues.
  const userRef        = useRef<AuthUser | null>(null)
  const instanceIdRef  = useRef<number | null>(null)
  if (instanceIdRef.current === null) {
    instanceIdRef.current = ++authInstanceSeq
  }

  useEffect(() => {
    let cancelled = false
    let _buildCallCount = 0
    const instanceId = instanceIdRef.current

    // eslint-disable-next-line no-console
    console.log(`[DIAG:useAuth] instance #${instanceId} mounted`)

    // Failsafe: only fires if INITIAL_SESSION never arrived (hook genuinely stuck)
    const failsafe = setTimeout(() => {
      if (!initializedRef.current) {
        logger.warn('[useAuth] failsafe — INITIAL_SESSION never received in 8s')
        setIsLoading(false)
      }
    }, 8_000)

    const { data: { subscription } } = getSupabase().auth.onAuthStateChange(
      async (event: AuthChangeEvent, session: Session | null) => {
        if (cancelled) return
        // eslint-disable-next-line no-console
        console.log(`[DIAG:useAuth] instance #${instanceId} event:${event} session:${session ? 'OK' : 'null'} init:${initializedRef.current} userRef:${userRef.current?.activeMembership ? 'has-membership' : 'no-membership'}`)
        logger.debug('[useAuth]', event, session ? 'session OK' : 'session null')

        // Explicit sign-out: clear everything
        if (event === 'SIGNED_OUT') {
          // eslint-disable-next-line no-console
          console.log(`[DIAG:useAuth] instance #${instanceId} commit`, {
            reason: 'SIGNED_OUT',
            user: null,
            activeMembership: null,
            location_id: null,
          })
          userRef.current = null
          setUser(null)
          setError(null)
          setIsLoading(false)
          initializedRef.current = true
          clearTimeout(failsafe)
          return
        }

        // INITIAL_SESSION with no session: user is definitively not logged in
        if (event === 'INITIAL_SESSION' && !session) {
          // eslint-disable-next-line no-console
          console.log(`[DIAG:useAuth] instance #${instanceId} commit`, {
            reason: 'INITIAL_SESSION:null',
            user: null,
            activeMembership: null,
            location_id: null,
          })
          userRef.current = null
          setUser(null)
          setError(null)
          setIsLoading(false)
          initializedRef.current = true
          clearTimeout(failsafe)
          return
        }

        // Any other event with null session (e.g. transient race during TOKEN_REFRESHED):
        // do NOT clear a valid user already in state
        if (!session) {
          logger.warn('[useAuth] null session on', event, '— ignoring, preserving user')
          if (!initializedRef.current) {
            setIsLoading(false)
            initializedRef.current = true
            clearTimeout(failsafe)
          }
          return
        }

        // TOKEN_REFRESHED with a valid user already loaded: skip buildUser.
        // Token rotation only changes the JWT — profile, memberships, and locations
        // are unchanged. Running buildUser here causes a race where the concurrent
        // query can receive empty memberships and overwrite a valid activeMembership.
        if (event === 'TOKEN_REFRESHED' && userRef.current?.activeMembership) {
          // eslint-disable-next-line no-console
          console.log(`[DIAG:useAuth] instance #${instanceId} TOKEN_REFRESHED — user already loaded, skipping buildUser`)
          if (!initializedRef.current) {
            setIsLoading(false)
            initializedRef.current = true
            clearTimeout(failsafe)
          }
          return
        }

        // Valid session: build user from DB
        const callId = ++_buildCallCount
        const { user: built, error: buildError } = await buildUser(session, callId)
        if (cancelled) return

        if (built !== null) {
          setUser(prev => {
            if (prev?.activeMembership && !built.activeMembership) {
              // eslint-disable-next-line no-console
              console.log(`[DIAG:useAuth] instance #${instanceId} keeping existing user — new build had no activeMembership`)
              userRef.current = prev
              return prev
            }
            // eslint-disable-next-line no-console
            console.log(`[DIAG:useAuth] instance #${instanceId} commit`, {
              reason: event,
              user: built.profile.id,
              activeMembership: built.activeMembership?.id ?? null,
              location_id: built.activeMembership?.location_id ?? null,
              buildError,
            })
            userRef.current = built
            return built
          })
          setError(buildError)
        } else if (!initializedRef.current) {
          // First load and profile fetch failed: surface null so page can show fallback
          // eslint-disable-next-line no-console
          console.log(`[DIAG:useAuth] instance #${instanceId} commit`, {
            reason: `${event}:build-null:first-load`,
            user: null,
            activeMembership: null,
            location_id: null,
          })
          userRef.current = null
          setUser(null)
          setError(null)
        }
        // Post-init buildUser failure: keep existing user + error state as-is

        setIsLoading(false)
        initializedRef.current = true
        clearTimeout(failsafe)
      }
    )

    return () => {
      cancelled = true
      // eslint-disable-next-line no-console
      console.log(`[DIAG:useAuth] instance #${instanceId} unmounted`)
      subscription.unsubscribe()
      clearTimeout(failsafe)
    }
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

  return { user, isLoading, error, role, isOwner, isManager, setActiveMembership, signOut }
}
