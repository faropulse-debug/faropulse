import { createBrowserClient } from '@supabase/ssr'
import { env } from '@/lib/env'

let _client: ReturnType<typeof createBrowserClient> | null = null

export function getSupabase() {
  if (!_client) {
    // @supabase/ssr v0.9.0 createBrowserClient already enforces (after spreading options.auth):
    //   autoRefreshToken: isBrowser() → true
    //   persistSession:   true
    //   detectSessionInUrl: isBrowser() → true
    //   flowType: 'pkce'
    // Passing these explicitly here would be overridden — no change needed.
    _client = createBrowserClient(env.supabaseUrl, env.supabaseAnonKey)
  }
  return _client
}
