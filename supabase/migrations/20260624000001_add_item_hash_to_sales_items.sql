-- ============================================================
-- Migration 1/3: add item_hash column + SQL function
-- Date: 2026-06-24
--
-- item_hash is a portable idempotency key for sales_items rows.
-- Hash composition: SHA-256 of 6 business-semantic fields common
-- to any POS (no Maxirest-specific identifiers):
--   numero_ticket | fecha_caja | descripcion | cantidad | precio_total | occurrence
--
-- `occurrence` = 0-indexed counter per content group within a file,
-- assigned at upload time by the TypeScript enrichRows() hook.
-- The hash SET for a file is invariant to row reordering.
--
-- Mirror of TypeScript generate-item-hash.ts — both must produce
-- identical output:
--   money: ROUND(x,2)::text  ↔  Number(n).toFixed(2)
--   qty:   ROUND(x,4)::text  ↔  Number(n).toFixed(4)
-- In PostgreSQL, ROUND on NUMERIC preserves trailing zeros,
-- matching JavaScript's toFixed() exactly.
--
-- Column starts nullable; backfill migration populates all rows;
-- promotion migration adds UNIQUE constraint.
-- ============================================================

ALTER TABLE public.sales_items
  ADD COLUMN IF NOT EXISTS item_hash TEXT;

-- Non-unique index allows efficient backfill and query before promotion.
CREATE INDEX IF NOT EXISTS idx_sales_items_item_hash
  ON public.sales_items(location_id, item_hash);

CREATE OR REPLACE FUNCTION public.generate_item_hash(
  p_numero_ticket TEXT,
  p_fecha_caja    DATE,
  p_descripcion   TEXT,
  p_cantidad      NUMERIC,
  p_precio_total  NUMERIC,
  p_occurrence    INTEGER
) RETURNS TEXT
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT encode(sha256(concat(
    coalesce(p_numero_ticket::text,                      ''), '|',
    coalesce(p_fecha_caja::text,                         ''), '|',
    coalesce(p_descripcion::text,                        ''), '|',
    coalesce(ROUND(p_cantidad::numeric,     4)::text,    ''), '|',
    coalesce(ROUND(p_precio_total::numeric, 2)::text,    ''), '|',
    p_occurrence::text
  )::bytea), 'hex')
$$;

GRANT EXECUTE ON FUNCTION public.generate_item_hash TO anon, authenticated, service_role;
