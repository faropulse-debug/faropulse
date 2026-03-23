// Next.js only inlines NEXT_PUBLIC_ vars when accessed statically (dot notation).
// Bracket notation (process.env[v]) is NOT replaced at build time — never use it here.

export const env = {
  supabaseUrl:     process.env.NEXT_PUBLIC_SUPABASE_URL     ?? '',
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
}

// Server-side: fail hard in development so the error is caught early at startup.
if (typeof window === 'undefined' && process.env.NODE_ENV === 'development') {
  if (!env.supabaseUrl)     throw new Error('[FARO] Missing env var: NEXT_PUBLIC_SUPABASE_URL')
  if (!env.supabaseAnonKey) throw new Error('[FARO] Missing env var: NEXT_PUBLIC_SUPABASE_ANON_KEY')
}

// Client-side: warn without crashing (values are inlined at build time in production).
if (typeof window !== 'undefined' && !env.supabaseUrl) {
  console.warn('[FARO] NEXT_PUBLIC_SUPABASE_URL not found — check your .env.local')
}
