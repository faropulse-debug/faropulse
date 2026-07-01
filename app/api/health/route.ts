import { NextResponse } from 'next/server'

export async function GET() {
  const supabaseUrl    = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl) {
    console.error('[health] NEXT_PUBLIC_SUPABASE_URL is missing')
    return NextResponse.json({ status: 'error' }, { status: 503 })
  }
  if (!serviceRoleKey) {
    console.error('[health] SUPABASE_SERVICE_ROLE_KEY is missing')
    return NextResponse.json({ status: 'error' }, { status: 503 })
  }

  try {
    const res = await fetch(`${supabaseUrl}/rest/v1/`, {
      headers: {
        'apikey': serviceRoleKey,
      },
      signal: AbortSignal.timeout(5_000),
    })
    if (res.ok) {
      return NextResponse.json({ status: 'ok' })
    }
    // 401/403 → key present but rejected by Supabase
    console.error(`[health] Supabase rejected request: HTTP ${res.status}`)
    return NextResponse.json({ status: 'error' }, { status: 503 })
  } catch (err) {
    // Network error or timeout
    console.error('[health] Supabase connectivity failed:', err)
    return NextResponse.json({ status: 'error' }, { status: 503 })
  }
}
