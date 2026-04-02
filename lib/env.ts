// Next.js only inlines NEXT_PUBLIC_ vars when accessed statically (dot notation).
// Bracket notation (process.env[v]) is NOT replaced at build time — never use it here.

export const env = {
  supabaseUrl:     (process.env.NEXT_PUBLIC_SUPABASE_URL     ?? '').trim(),
  supabaseAnonKey: (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '').trim(),
}

// Server-side: fail hard in all environments so missing vars surface at startup, not at runtime.
if (typeof window === 'undefined') {
  if (!env.supabaseUrl)     throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL — check Vercel env vars scope')
  if (!env.supabaseAnonKey) throw new Error('Missing NEXT_PUBLIC_SUPABASE_ANON_KEY — check Vercel env vars scope')
}

// Client-side: warn without crashing (values are inlined at build time in production).
if (typeof window !== 'undefined' && !env.supabaseUrl) {
  console.warn('[FARO] NEXT_PUBLIC_SUPABASE_URL not found — check your .env.local')
}
