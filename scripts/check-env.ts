const REQUIRED = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
] as const

const missing = REQUIRED.filter(key => !process.env[key])

if (missing.length > 0) {
  console.error('\n[check-env] ERROR: Missing required environment variables:')
  for (const key of missing) {
    console.error(`  - ${key}`)
  }
  console.error('\n  Set them in Vercel Settings -> Environment Variables before deploying.\n')
  process.exit(1)
}

console.log('[check-env] All required environment variables are present.')
