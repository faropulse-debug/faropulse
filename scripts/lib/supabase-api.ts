import postgres from 'postgres'

export type ActualPolicy = {
  name: string
  cmd: string
  roles: string[]
  qual: string | null
  with_check: string | null
}

export type ActualTable = {
  name: string
  rls: boolean
  policies: ActualPolicy[]
}

export type SqlConfig = 
  | { projectRef: string; token: string }
  | { connectionString: string }

export async function executeSql(
  query: string,
  config: SqlConfig
): Promise<Record<string, unknown>[]> {
  if ('connectionString' in config) {
    const sqlDriver = postgres(config.connectionString)
    try {
      const result = await sqlDriver.unsafe(query)
      return result as unknown as Record<string, unknown>[]
    } finally {
      await sqlDriver.end()
    }
  } else {
    const { projectRef, token } = config
    const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ query }),
    })
    if (!res.ok) throw new Error(`SQL error ${res.status}: ${await res.text()}`)
    return res.json() as Promise<Record<string, unknown>[]>
  }
}

// Backward compatible for audit-security-posture and audit-rls
export async function sql(
  projectRef: string,
  token: string,
  query: string
): Promise<Record<string, unknown>[]> {
  return executeSql(query, { projectRef, token })
}

export function isRlsEnabled(value: unknown): boolean {
  return value === true || value === 't'
}

export async function fetchActualState(
  projectRef: string,
  token: string
): Promise<Record<string, ActualTable>> {
  const tables = await sql(projectRef, token, `
    SELECT tablename, rowsecurity
    FROM pg_tables
    WHERE schemaname = 'public'
  `)

  const policies = await sql(projectRef, token, `
    SELECT tablename, policyname, cmd, array_to_string(roles, ',') AS roles, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public'
  `)

  const state: Record<string, ActualTable> = {}

  for (const row of tables) {
    const name = row.tablename as string
    state[name] = { name, rls: isRlsEnabled(row.rowsecurity), policies: [] }
  }

  for (const row of policies) {
    const name = row.tablename as string
    if (!state[name]) state[name] = { name, rls: false, policies: [] }
    state[name].policies.push({
      name: row.policyname as string,
      cmd: row.cmd as string,
      roles: String(row.roles ?? '').split(',').filter(Boolean),
      qual: typeof row.qual === 'string' ? row.qual : null,
      with_check: typeof row.with_check === 'string' ? row.with_check : null,
    })
  }

  return state
}

export type ColumnInfo = {
  name: string
  type: string
  nullable: boolean
  default_val: string | null
}

export type ConstraintInfo = {
  name: string
  type: string
  def: string
}

export type IndexInfo = {
  name: string
  def: string
}

export type TableSchema = {
  name: string
  columns: Record<string, ColumnInfo>
  constraints: Record<string, ConstraintInfo>
  indices: Record<string, IndexInfo>
}

export type FunctionSchema = {
  name: string
  args: string
  return_type: string
  body: string
}

export type SchemaState = {
  tables: Record<string, TableSchema>
  functions: Record<string, FunctionSchema>
  applied_migrations: string[]
}

export async function fetchSchemaState(config: SqlConfig): Promise<SchemaState> {
  const tablesPromise = executeSql(`SELECT tablename FROM pg_tables WHERE schemaname = 'public'`, config)
  const columnsPromise = executeSql(`SELECT table_name, column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema = 'public'`, config)
  const constraintsPromise = executeSql(`
    SELECT conname, contype, relname AS table_name, pg_get_constraintdef(c.oid) AS def
    FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
  `, config)
  const indicesPromise = executeSql(`SELECT tablename, indexname, indexdef FROM pg_indexes WHERE schemaname = 'public'`, config)
  const functionsPromise = executeSql(`
    SELECT p.proname AS name, 
           pg_get_function_identity_arguments(p.oid) AS args,
           pg_get_function_result(p.oid) AS return_type,
           p.prosrc AS body
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
  `, config)
  
  // supabase_migrations.schema_migrations may not exist if no migrations ran
  const migrationsPromise = executeSql(`SELECT version FROM supabase_migrations.schema_migrations`, config).catch(() => [] as Record<string, unknown>[])

  const [
    tablesRes, 
    columnsRes, 
    constraintsRes, 
    indicesRes, 
    functionsRes, 
    migrationsRes
  ] = await Promise.all([
    tablesPromise, 
    columnsPromise, 
    constraintsPromise, 
    indicesPromise, 
    functionsPromise, 
    migrationsPromise
  ])

  const state: SchemaState = {
    tables: {},
    functions: {},
    applied_migrations: migrationsRes.map(row => String(row.version))
  }

  function ensureTable(name: string) {
    if (!state.tables[name]) {
      state.tables[name] = {
        name,
        columns: {},
        constraints: {},
        indices: {}
      }
    }
  }

  // Initialize tables
  for (const row of tablesRes) {
    ensureTable(row.tablename as string)
  }

  // Populate columns
  for (const row of columnsRes) {
    const tableName = row.table_name as string
    ensureTable(tableName)
    state.tables[tableName].columns[row.column_name as string] = {
      name: row.column_name as string,
      type: row.data_type as string,
      nullable: row.is_nullable === 'YES',
      default_val: row.column_default !== null ? String(row.column_default) : null
    }
  }

  // Populate constraints
  for (const row of constraintsRes) {
    const tableName = row.table_name as string
    ensureTable(tableName)
    state.tables[tableName].constraints[row.conname as string] = {
      name: row.conname as string,
      type: row.contype as string,
      def: row.def as string
    }
  }

  // Populate indices
  for (const row of indicesRes) {
    const tableName = row.tablename as string
    ensureTable(tableName)
    state.tables[tableName].indices[row.indexname as string] = {
      name: row.indexname as string,
      def: row.indexdef as string
    }
  }

  // Populate functions
  for (const row of functionsRes) {
    const funcName = row.name as string
    const funcSig = `${funcName}(${row.args})` // unique identifier
    state.functions[funcSig] = {
      name: funcName,
      args: row.args as string,
      return_type: row.return_type as string,
      body: row.body as string
    }
  }

  return state
}
