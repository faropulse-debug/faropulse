export function assertStagingEnvironment(): void {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
  
  // Extract project ref (e.g., from https://egjxyskqhnmuqwkrbshu.supabase.co -> egjxyskqhnmuqwkrbshu)
  const match = url.match(/https:\/\/([^.]+)\.supabase/)
  const projectRef = match ? match[1] : (url ? 'unknown-ref' : 'missing-url')

  if (!url.includes('egjxyskqhnmuqwkrbshu')) {
    console.error(`[GUARDRAIL ERROR] Environment is NOT Staging! Detected project-ref: "${projectRef}". Execution aborted.`)
    process.exit(1)
  }

  console.log(`[GUARDRAIL OK] Staging environment verified (project-ref: ${projectRef}).`)
}

// Auto-run only if executed directly via CLI
if (typeof require !== 'undefined' && require.main === module) {
  assertStagingEnvironment()
}
