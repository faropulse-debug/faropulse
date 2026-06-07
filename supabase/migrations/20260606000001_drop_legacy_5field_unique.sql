-- ============================================================
-- Migration: drop legacy non-hash unique indexes on sales_documents
-- Date: 2026-06-06
--
-- Bug: one or more UNIQUE indexes coexist with
-- idx_sales_documents_ticket_hash_unique, blocking inserts when
-- the same ticket is re-uploaded with a hash that changed due to
-- floating-point drift in descuento/recargo.
--
-- The 5-field manual index (external_id, location_id, total, fecha,
-- COALESCE(cliente,'')) was created outside migrations and is not
-- tracked by any migration file. The 3-field constraint
-- sales_documents_unique_doc (external_id, location_id, total) was
-- introduced in 20260402000000 and has the same problem.
--
-- After this migration, idx_sales_documents_ticket_hash_unique is
-- the sole uniqueness source for sales_documents rows.
-- ============================================================

-- 1. Drop the 3-field constraint from migration 20260402 (known name).
ALTER TABLE public.sales_documents
  DROP CONSTRAINT IF EXISTS sales_documents_unique_doc;

-- Also try original 2-field constraint name from initial schema.
ALTER TABLE public.sales_documents
  DROP CONSTRAINT IF EXISTS sales_documents_external_id_location_id_key;

-- 2. Dynamically find and drop any remaining legacy unique index on
--    sales_documents that is NOT the ticket_hash_unique index and NOT
--    the primary key. Covers the 5-field manual index regardless of
--    the exact name it was given when created outside migrations.
DO $$
DECLARE
  v_idx  text;
  v_def  text;
BEGIN
  FOR v_idx, v_def IN
    SELECT indexname, indexdef
    FROM pg_indexes
    WHERE tablename  = 'sales_documents'
      AND schemaname = 'public'
      AND indexdef   ILIKE '%unique%'
      AND indexname  NOT IN (
        'sales_documents_pkey',
        'idx_sales_documents_ticket_hash_unique'
      )
  LOOP
    RAISE NOTICE 'Dropping legacy unique index: % | def: %', v_idx, v_def;
    EXECUTE format('DROP INDEX IF EXISTS public.%I', v_idx);
  END LOOP;
END;
$$;
