import { NextResponse } from 'next/server'

export async function GET() {
  const supabaseUrl   = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  const urlStatus: 'ok' | 'missing' = supabaseUrl ? 'ok' : 'missing'

  let keyStatus: 'ok' | 'missing' | 'invalid' = 'missing'
  if (serviceRoleKey) {
    keyStatus = serviceRoleKey.startsWith('eyJ') && serviceRoleKey.length > 100 ? 'ok' : 'invalid'
  }

  let supabaseConnection: 'ok' | 'error' = 'error'
  if (supabaseUrl && keyStatus === 'ok') {
    try {
      const res = await fetch(`${supabaseUrl}/rest/v1/`, {
        headers: {
          'apikey':        serviceRoleKey!,
          'Authorization': `Bearer ${serviceRoleKey}`,
        },
        signal: AbortSignal.timeout(5_000),
      })
      supabaseConnection = res.ok ? 'ok' : 'error'
    } catch {
      supabaseConnection = 'error'
    }
  }

  return NextResponse.json({
    supabaseUrl:        urlStatus,
    serviceRoleKey:     keyStatus,
    supabaseConnection,
  })
}
