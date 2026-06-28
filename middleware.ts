import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const PUBLIC_ROUTES      = ['/login', '/forgot-password', '/reset-password']
const PUBLIC_API_PREFIXES = ['/api/health']

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // eslint-disable-next-line no-console
  console.log('[DIAG:middleware] running for', pathname)

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

  const role = request.cookies.get('faro_role')?.value

  if (pathname.startsWith('/dashboard/owner') && role !== 'owner') {
    const url = request.nextUrl.clone()
    url.pathname = '/role-select'
    return NextResponse.redirect(url)
  }

  if (pathname.startsWith('/dashboard/manager') && role !== 'manager') {
    const url = request.nextUrl.clone()
    url.pathname = '/role-select'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
