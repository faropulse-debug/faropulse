// Validates required environment variables at module load time.
// Fails early in development/build; prevents silent failures in production.

const REQUIRED_VARS = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
] as const

for (const v of REQUIRED_VARS) {
  if (!process.env[v]) {
    throw new Error(
      `[FARO] Missing required environment variable: ${v}\n` +
      `Copy .env.example to .env.local and fill in the values.`
    )
  }
}

export const env = {
  supabaseUrl:     process.env.NEXT_PUBLIC_SUPABASE_URL!,
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
}
