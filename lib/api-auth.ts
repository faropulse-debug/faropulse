import { createServerClient } from '@supabase/ssr'
import { createClient }       from '@supabase/supabase-js'
import { NextResponse }       from 'next/server'
import type { NextRequest }   from 'next/server'

/**
 * Validates that the caller has an authenticated session AND an active
 * membership in the specified location.
 *
 * Accepts credentials via:
 *   1. Supabase session cookie (standard browser fetch, same-origin)
 *   2. Authorization: Bearer <jwt> (smoke scripts / CLI tools with a real user JWT)
 *
 * In both cases the JWT is validated via supabase.auth.getUser() which hits
 * the Supabase Auth API — it is NOT a local decode and respects token revocation.
 *
 * Role enforcement is NOT included here; it belongs in the role-gating PR.
 *
 * Returns { userId } on success, or a ready-to-return Response on failure.
 */
export async function requireMembership(
  req: NextRequest,
  locationId: string,
): Promise<{ userId: string } | Response> {
  const url     = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const anon    = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  const svcKey  = process.env.SUPABASE_SERVICE_ROLE_KEY!

  // ── Step 1: authenticate ─────────────────────────────────────────────────────
  let userId: string | undefined

  const authHeader = req.headers.get('authorization') ?? ''

  if (authHeader.startsWith('Bearer ')) {
    // Bearer path: smoke scripts / non-browser callers supply a real user JWT.
    // getUser(jwt) calls the Supabase Auth server — not a local decode.
    const token = authHeader.slice(7)
    const { data: { user }, error } = await createClient(url, anon).auth.getUser(token)
    if (error || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    userId = user.id
  } else {
    // Cookie path: standard browser session managed by @supabase/ssr.
    const supabase = createServerClient(url, anon, {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: () => {},  // read-only check — we don't need to forward refreshed cookies
      },
    })
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    userId = user.id
  }

  const svc = createClient(url, svcKey)

  // ── Step 2: verify active membership for this location ──────────────────────
  // memberships.location_id is now populated directly — no need to bridge
  // through locations.org_id anymore.
  const { data, error: memberError } = await svc
    .from('memberships')
    .select('id')
    .eq('user_id', userId)
    .eq('location_id', locationId)
    .eq('is_active', true)
    .maybeSingle()

  if (memberError || !data) {
    return NextResponse.json(
      { error: 'Forbidden: no active membership for this location' },
      { status: 403 },
    )
  }

  return { userId }
}
