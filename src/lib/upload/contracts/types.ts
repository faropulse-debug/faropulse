/** Identifies the business dataset this contract processes. */
export type DatasetType = 'sales' | 'items' | 'stock' | 'prices' | 'pnl';

/** Identifies how data arrives — the ingestion mechanism. */
export type SourceType = 'excel' | 'csv' | 'api_pull' | 'api_push' | 'db_query' | 'sftp' | 'manual';

/** Tenant + event context passed to parsing and validation functions. */
export interface ParseContext {
  orgId: string;
  locationId: string;
  eventId: string;
}

/** Result returned by field-level and schema validation steps. */
export interface ValidationResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

/** Display configuration consumed by the upload UI components. */
export interface UIConfig {
  title: string;
  description: string;
  icon: string;
  accentColor: string;
  order: number;
}

/** Context provided to all lifecycle hook callbacks. */
export interface HookContext {
  eventId: string;
  contractId: string;
  orgId: string;
  locationId: string;
  rowCount?: number;
  metadata?: Record<string, unknown>;
}

/** A typed ingestion source — channel descriptor plus raw payload. */
export interface DataSource {
  type: SourceType;
  payload: unknown;
}

/**
 * Core contract that every data-source adapter must satisfy.
 * TRow is the typed row shape after parseRow normalises raw input.
 */
export interface DataSourceContract<TRow> {
  /** Unique identifier for this contract (e.g. "toast-sales"). */
  id: string;

  /** Human-readable POS or integration name (e.g. "Toast"). */
  posName: string;

  /** Business dataset this contract ingests. */
  datasetType: DatasetType;

  /** Ingestion mechanism. */
  sourceType: SourceType;

  /** Target database table name. */
  table: string;

  /** Semantic version string for schema compatibility tracking. */
  version: string;

  /** Validates the raw DataSource before extraction begins. */
  validate(source: DataSource, ctx: ParseContext): Promise<ValidationResult>;

  /** Yields raw records lazily from the source. */
  extract(source: DataSource, ctx: ParseContext): AsyncIterable<unknown>;

  /** Converts a single raw record into a typed TRow, or null to skip the row. */
  parseRow(raw: unknown, ctx: ParseContext): TRow | null;

  /** Column(s) used to compute the idempotency hash. */
  hashColumn: keyof TRow | Array<keyof TRow>;

  /** Derives the idempotency hash from a parsed row. */
  computeHash(row: TRow): string;

  /** UI display metadata for the upload card component. */
  uiConfig: UIConfig;

  /** Optional cross-row business-rule validation run after extraction. */
  validateBusinessRules?(rows: TRow[], ctx: ParseContext): Promise<ValidationResult>;

  // Lifecycle hooks — all optional

  /** Called immediately after a source payload is received. */
  onReceived?(source: DataSource, ctx: HookContext): Promise<void>;

  /** Called after field-level validation completes. */
  onValidated?(result: ValidationResult, ctx: HookContext): Promise<void>;

  /** Called after rows are successfully committed to the database. */
  onCommitted?(rowCount: number, ctx: HookContext): Promise<void>;

  /** Called when a transaction or batch is rolled back. */
  onRolledBack?(error: unknown, ctx: HookContext): Promise<void>;

  /** Called when an anomaly is detected during processing. */
  onAnomaly?(anomaly: unknown, ctx: HookContext): Promise<void>;
}
