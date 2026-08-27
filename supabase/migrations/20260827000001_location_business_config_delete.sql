-- ============================================================
-- Migration: location_business_config — DELETE
-- Fecha: 2026-08-27
--
-- H3 Parte A dejó configurar una clave (POST /api/business-config)
-- pero no volverla a "no configurado": no había policy ni GRANT de
-- DELETE en location_business_config. Codex quedó bloqueado en
-- Parte B — la UI puede cargar valores pero nunca desconfigurarlos.
--
-- Migración aditiva: no toca la tabla, el CHECK, ni las policies
-- de SELECT/INSERT/UPDATE de 20260826000001_location_business_config.sql.
-- Mismo criterio de autorización que INSERT/UPDATE (user_has_write_role,
-- ya creada en esa migración — no se recrea acá).
--
-- Explícito a propósito: borrar una fila es la única forma de volver a
-- "no configurado" (fila ausente). No hay endpoint que ponga value=0
-- ni que infiera "borrar" de un PATCH con null — ver docstring de
-- lib/business-config.ts y el contrato en
-- docs/qa/H3-PARTE-A-BUSINESS-CONFIG.md.
-- ============================================================

CREATE POLICY location_business_config_delete
  ON public.location_business_config
  FOR DELETE
  TO authenticated
  USING (public.user_has_write_role(location_id));

GRANT DELETE ON public.location_business_config TO authenticated;
