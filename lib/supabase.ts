import { createBrowserClient } from '@supabase/ssr'
import { env } from '@/lib/env'

export const supabase = createBrowserClient(
  env.supabaseUrl,
  env.supabaseAnonKey,
)
