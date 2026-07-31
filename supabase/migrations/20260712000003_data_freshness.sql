-- Versiona data_freshness. Ya existe en STG (aplicada a mano vía
-- scripts/migration-data-freshness.sql, nunca versionada). Aplicada también en
-- PROD el 2026-07-23 (verificado 2026-07-24 vía Management API: tabla + policy
-- presentes, 0 filas — normal, todavía no corrió upload en PROD desde que se creó).
-- Write-only: usada por upsertFreshness() en src/lib/upload/pipeline/runPipeline.ts
-- (solo en el código de develop; la ruta de upload de main no la toca).
-- Idempotente: CREATE TABLE IF NOT EXISTS + DROP POLICY IF EXISTS antes de CREATE POLICY.

CREATE TABLE IF NOT EXISTS public.data_freshness (
  id            uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  location_id   uuid        NOT NULL,
  dataset       text        NOT NULL,  -- 'sales_documents' | 'sales_items'
  rows_affected integer,
  last_upload   timestamptz DEFAULT now(),
  UNIQUE (location_id, dataset)
);

ALTER TABLE public.data_freshness ENABLE ROW LEVEL SECURITY;

-- service_role bypasea RLS, pero dejamos política explícita para anon/authenticated
DROP POLICY IF EXISTS "service_role_all" ON public.data_freshness;
CREATE POLICY "service_role_all" ON public.data_freshness
  FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMENT ON TABLE public.data_freshness IS
  'Última carga exitosa por (location_id, dataset). Upserted por runUploadPipeline (solo develop/STG hoy).';
