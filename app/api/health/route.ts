import { NextResponse } from 'next/server'

export async function GET() {
  const supabaseUrl    = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  const urlStatus: 'ok' | 'missing' = supabaseUrl ? 'ok' : 'missing'

  let keyStatus: 'ok' | 'missing' | 'invalid' = 'missing'
  let supabaseConnection: 'ok' | 'error' = 'error'

  if (supabaseUrl && serviceRoleKey) {
    try {
      const res = await fetch(`${supabaseUrl}/rest/v1/`, {
        headers: {
          'apikey':        serviceRoleKey,
          'Authorization': `Bearer ${serviceRoleKey}`,
        },
        signal: AbortSignal.timeout(5_000),
      })
      if (res.ok) {
        keyStatus = 'ok'
        supabaseConnection = 'ok'
      } else {
        // 401/403 → key present but rejected by Supabase
        keyStatus = res.status === 401 || res.status === 403 ? 'invalid' : 'ok'
        supabaseConnection = 'error'
      }
    } catch {
      // Network error or timeout — key is present, connectivity is the problem
      keyStatus = 'ok'
      supabaseConnection = 'error'
    }
  }

  return NextResponse.json({
    supabaseUrl:        urlStatus,
    serviceRoleKey:     keyStatus,
    supabaseConnection,
  })
}
