import { createBrowserClient } from '@supabase/ssr'
import { processLock } from '@supabase/auth-js'
import { env } from '@/lib/env'

let _client: ReturnType<typeof createBrowserClient> | null = null

export function getSupabase() {
  if (!_client) {
    _client = createBrowserClient(env.supabaseUrl, env.supabaseAnonKey, {
      auth: { lock: processLock },
    })
  }
  return _client
}
