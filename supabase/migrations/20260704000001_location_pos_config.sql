-- ============================================================
-- Migration: location_pos_config
-- Fecha: 2026-07-04
--
-- Configuración de conexión al POS (CucinaGo, y futuros
-- proveedores) por location. Consumida por lib/pos-config.ts
-- (getCucinaGoConfig) para el feature de reconciliación
-- /dashboard/reconcile.
--
-- UNIQUE(location_id, provider): un local puede tener a lo sumo
-- una config por proveedor de POS.
--
-- Mismo SQL ya ejecutado y validado manualmente en STG.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.location_pos_config (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid NOT NULL REFERENCES public.locations(id),
  provider    text NOT NULL,
  base_url    text NOT NULL,
  empresa     text NOT NULL,
  suca        text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (location_id, provider)
);

ALTER TABLE public.location_pos_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY location_pos_config_select
  ON public.location_pos_config
  FOR SELECT
  TO authenticated
  USING (public.user_has_membership(location_id));

CREATE POLICY location_pos_config_insert
  ON public.location_pos_config
  FOR INSERT
  TO authenticated
  WITH CHECK (public.user_has_membership(location_id));

CREATE POLICY location_pos_config_delete
  ON public.location_pos_config
  FOR DELETE
  TO authenticated
  USING (public.user_has_membership(location_id));
