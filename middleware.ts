import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const PUBLIC_ROUTES = ['/login', '/forgot-password', '/reset-password']

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Allow public routes through immediately
  if (PUBLIC_ROUTES.some(r => pathname === r)) {
    return NextResponse.next()
  }

  // Build the Supabase server client — required to refresh session cookies
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          // Propagate refreshed cookies to both request and response
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Validate session via Supabase (secure — never trusts client-only JWT)
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  // Role-based dashboard protection — reads the cookie set after login/role-select
  const role = request.cookies.get('faro_role')?.value

  if (pathname.startsWith('/dashboard/owner')) {
    if (role !== 'owner') {
      const url = request.nextUrl.clone()
      url.pathname = '/role-select'
      return NextResponse.redirect(url)
    }
  }

  if (pathname.startsWith('/dashboard/manager')) {
    if (role !== 'manager') {
      const url = request.nextUrl.clone()
      url.pathname = '/role-select'
      return NextResponse.redirect(url)
    }
  }

  // Return supabaseResponse (not NextResponse.next()) so refreshed
  // session cookies are forwarded to the browser
  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
