export type SecurityRule = 'RLS_OFF' | 'NO_POLICIES' | 'ANON_PUBLIC_ROLE' | 'USING_TRUE'

export interface SecurityException {
  table: string
  rule: SecurityRule
  policyName?: string
  expectedRoles?: string[]
  reason: string
}

export const SECURITY_EXCEPTIONS: SecurityException[] = [
  { table: 'schema_migrations', rule: 'NO_POLICIES', reason: 'Tabla del sistema migratorio (Drizzle/Supabase)' },
  { table: 'schema_migrations', rule: 'RLS_OFF', reason: 'Tabla del sistema migratorio (Drizzle/Supabase)' },
  { table: 'calendar_context', rule: 'USING_TRUE', expectedRoles: ['authenticated'], reason: 'Tabla de feriados global (sin columna tenant) que debe ser leíble por cualquier sesión' }
]
