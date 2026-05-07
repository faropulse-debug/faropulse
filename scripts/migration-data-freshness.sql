-- Crear tabla data_freshness para tracking de última carga por dataset
-- Ejecutar en Supabase SQL Editor (STG y PROD por separado)

CREATE TABLE IF NOT EXISTS data_freshness (
  id            uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  location_id   uuid        NOT NULL,
  dataset       text        NOT NULL,  -- 'sales_documents' | 'sales_items'
  rows_affected integer,
  last_upload   timestamptz DEFAULT now(),
  UNIQUE (location_id, dataset)
);

ALTER TABLE data_freshness ENABLE ROW LEVEL SECURITY;

-- service_role bypasea RLS, pero dejamos política explícita para anon/authenticated
CREATE POLICY "service_role_all" ON data_freshness
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Opcional: permitir lectura autenticada para dashboards
-- CREATE POLICY "authenticated_read" ON data_freshness
--   FOR SELECT TO authenticated USING (true);

COMMENT ON TABLE data_freshness IS
  'Última carga exitosa por (location_id, dataset). Upserted por el endpoint /api/upload/sales.';
