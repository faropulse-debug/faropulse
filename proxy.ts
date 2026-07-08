import { createServerClient } from '@supabase/ssr'
import { createClient }       from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const PUBLIC_ROUTES      = ['/login', '/forgot-password', '/reset-password']
const PUBLIC_API_PREFIXES = ['/api/health']

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (
    PUBLIC_ROUTES.some(r => pathname === r) ||
    PUBLIC_API_PREFIXES.some(p => pathname.startsWith(p))
  ) {
    return NextResponse.next()
  }

  // API routes with a Bearer token bypass the cookie session check here.
  // The route handler's requireMembership() validates the JWT via
  // supabase.auth.getUser() — this is not a security bypass.
  if (pathname.startsWith('/api/') &&
      request.headers.get('authorization')?.startsWith('Bearer ')) {
    return NextResponse.next()
  }

  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    },
  )

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    // API routes return JSON errors; page routes redirect to login
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  const DASHBOARD_ROLES = new Set(['owner', 'manager'])

  const requiredRole = pathname.startsWith('/dashboard/owner')   ? 'owner'
                     : pathname.startsWith('/dashboard/manager') ? 'manager'
                     : null

  if (requiredRole) {
    const cookieRole = request.cookies.get('faro_role')?.value

    // Fast path: wrong or missing cookie — no DB call needed
    if (cookieRole !== requiredRole) {
      return NextResponse.redirect(new URL('/role-select', request.url))
    }

    // Cookie value matches the path. Verify it reflects a real active membership
    // using service role so this check stays correct after RLS is enabled on
    // memberships (a session-key query would return empty → false forgery).
    // user.id is always from supabase.auth.getUser() above — never from the cookie.
    const { data: mem, error: memErr } = await createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )
      .from('memberships')
      .select('id')
      .eq('user_id', user.id)
      .eq('role', requiredRole)
      .eq('is_active', true)
      .maybeSingle()

    if (!memErr && !mem) {
      // Confirmed: no matching membership in DB — clear forged cookie + redirect
      const res = NextResponse.redirect(new URL('/role-select', request.url))
      res.cookies.set('faro_role', '', { maxAge: 0, path: '/' })
      return res
    }
    // memErr → fail-open: requireMembership() in API handlers is the real gate;
    // a transient PostgREST issue shouldn't lock out a legitimate user from navigation.
  } else if (pathname.startsWith('/dashboard/')) {
    // Fallback: /dashboard/* path not matched by owner or manager above.
    // Roles without a mapped dashboard (e.g. encargado) must not roam freely.
    const cookieRole = request.cookies.get('faro_role')?.value
    if (!cookieRole || !DASHBOARD_ROLES.has(cookieRole)) {
      return NextResponse.redirect(new URL('/role-select', request.url))
    }
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
