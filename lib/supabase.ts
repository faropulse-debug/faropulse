import { createBrowserClient } from '@supabase/ssr'
import { env } from '@/lib/env'

let _client: ReturnType<typeof createBrowserClient> | null = null

export function getSupabase() {
  if (!_client) {
    _client = createBrowserClient(env.supabaseUrl, env.supabaseAnonKey)
  }
  return _client
}
