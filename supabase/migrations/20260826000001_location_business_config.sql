-- ============================================================
-- Migration: location_business_config
-- Fecha: 2026-08-26
--
-- H3 Parte A — almacenamiento de configuración de negocio por
-- location. Reemplaza los números de negocio hoy hardcodeados en
-- React (AlertasSection.tsx, ProyeccionEjecutivaChart.tsx,
-- PE{Diario,Evolutivo,Semanal}Chart.tsx) por filas configurables
-- por local, leídas/escritas server-side.
--
-- Auditoría completa (12 valores hardcodeados en 5 archivos) en
-- el PR. Esta migración IMPLEMENTA 5 de esos 12 — los de
-- AlertasSection.tsx más INVERSION (compartida con
-- ProyeccionEjecutivaChart.tsx, que hoy la duplica en otra
-- escala: 210_000_000 vs 210). Los 7 supuestos del modelo de
-- proyección (COMENSALES_POR_DIA, INFLACION_MENSUAL, DELIVERY_PCT,
-- CV_PCT, CF_CRECIMIENTO, REGALIAS_PCT, DIC_ESTACIONAL) quedan
-- para Parte A.2 — NO están en el CHECK de `key` todavía: una key
-- que el registro TS no valida no debe ser aceptada por la DB
-- (evita la fila fantasma que este mismo diseño busca prevenir).
--
-- DISEÑO: clave/valor, no columnas.
-- Una columna por concepto no soporta un array (COMENSALES_POR_DIA,
-- 7 enteros) sin romper la forma de la tabla, y obliga a una
-- migración nueva por cada número que se configure. jsonb en
-- `value` cubre escalar y array por igual.
--
-- "NO CONFIGURADO" = fila ausente. No hay DEFAULT de negocio en
-- ninguna columna: si la fila no existe, get_location_business_config
-- simplemente no la devuelve. null/undefined en el consumidor
-- (Parte B, Codex) debe leerse como "no configurado", nunca como 0.
--
-- location_id SOLO (nada de org_id) — M-03 del diagnóstico de
-- cardinalidad: org_id y location_id son FKs independientes sin
-- CHECK/trigger que los ate en 6 tablas existentes. No se replica
-- ese patrón acá. Si se necesita el org, se deriva con JOIN a
-- locations.
--
-- Registro canónico de claves: lib/business-config.ts
-- (BUSINESS_CONFIG_KEYS). El CHECK de abajo y ese registro TS
-- tienen que decir lo mismo — tests/business-config-registry.test.ts
-- lo verifica parseando esta migración, para que una divergencia
-- rompa el build en vez de convertirse en una tercera lista fantasma.
--
-- Roles de escritura: mismo criterio que /dashboard/pnl
-- (lib/authz.ts WRITE_ROLES = ['owner','super_admin']). Se agrega
-- public.user_has_write_role() como espejo SQL de esa constante,
-- para que la restricción también valga a nivel RLS y no dependa
-- solo de que la ruta /api la aplique correctamente (mismo
-- criterio de "no confiar en una sola capa" que el resto del
-- sprint). tests/business-config-registry.test.ts también verifica
-- que la lista de roles del espejo SQL coincida con WRITE_ROLES.
-- ============================================================

-- ── Tabla ──────────────────────────────────────────────────────

CREATE TABLE public.location_business_config (
  location_id uuid        NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  key         text        NOT NULL,
  value       jsonb       NOT NULL,
  unit        text        NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  uuid        REFERENCES auth.users(id),
  PRIMARY KEY (location_id, key),

  -- Único punto de verdad para (key, unit) válidos. Ata cada key a
  -- su unidad correcta — evita, por ejemplo, insertar 'inversion_ars'
  -- con unit='pct' por un typo en el caller. Restringe implícitamente
  -- `key` a las 5 claves de Parte A: una key fuera de esta lista
  -- (incluidas las 7 de A.2, todavía no implementadas) es rechazada
  -- por la DB, no solo por el caller.
  CONSTRAINT location_business_config_key_unit_check CHECK (
    (key = 'inversion_ars'           AND unit = 'ARS')   OR
    (key = 'benchmark_laboral_pct'   AND unit = 'pct')   OR
    (key = 'cv_umbral_saludable_pct' AND unit = 'pct')   OR
    (key = 'cv_umbral_elevado_pct'   AND unit = 'pct')   OR
    (key = 'mc_objetivo_pct'         AND unit = 'ratio')
  ),

  -- Forma mínima de `value` a nivel DB (defensa en profundidad; la
  -- validación de rango completa — pct 0-100, ratio 0-1 — vive en
  -- la capa de exposición, ver lib/business-config.ts). 'comensales_dia'
  -- (A.2) queda permisivo acá a propósito: un array de 7 enteros no
  -- se valida bien con un CHECK simple y no es parte de Parte A.
  CONSTRAINT location_business_config_value_shape_check CHECK (
    CASE unit
      WHEN 'ARS'             THEN jsonb_typeof(value) = 'number' AND (value #>> '{}')::numeric > 0
      WHEN 'pct'              THEN jsonb_typeof(value) = 'number' AND (value #>> '{}')::numeric BETWEEN 0 AND 100
      WHEN 'ratio'            THEN jsonb_typeof(value) = 'number' AND (value #>> '{}')::numeric BETWEEN 0 AND 1
      WHEN 'comensales_dia'   THEN jsonb_typeof(value) = 'array'
      ELSE false
    END
  )
);

COMMENT ON TABLE public.location_business_config IS
  'Config de negocio por location (clave/valor). Fila ausente = no configurado. '
  'Parte A implementa 5 claves (inversion_ars, benchmark_laboral_pct, '
  'cv_umbral_saludable_pct, cv_umbral_elevado_pct, mc_objetivo_pct). '
  'Parte A.2 (pendiente) agrega 7 más del modelo de proyección: '
  'comensales_por_dia, inflacion_mensual, delivery_pct, cv_pct_proyeccion, '
  'cf_crecimiento_mensual, regalias_pct, diciembre_estacional_pct.';

COMMENT ON COLUMN public.location_business_config.value IS
  'jsonb escalar (number) para ARS/pct/ratio, array para comensales_dia (A.2). '
  'mc_objetivo_pct usa escala 0-1 (ratio) pese al sufijo _pct del nombre — '
  'coincide 1:1 con el literal que reemplaza (mc - 0.15) en los charts de PE. '
  'benchmark_laboral_pct / cv_umbral_*_pct usan escala 0-100 (pct) — '
  'coinciden 1:1 con `lastCL > 30`, `lastCV < 37/40` en AlertasSection.tsx.';

-- ── Helper de escritura (espejo SQL de lib/authz.ts WRITE_ROLES) ─

CREATE OR REPLACE FUNCTION public.user_has_write_role(p_location_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM memberships m
    WHERE m.user_id     = auth.uid()
      AND m.is_active    = true
      AND m.location_id  = p_location_id
      AND m.role IN ('owner', 'super_admin')  -- == lib/authz.ts WRITE_ROLES
  );
$$;

GRANT EXECUTE ON FUNCTION public.user_has_write_role(uuid) TO authenticated;

-- ── RLS ────────────────────────────────────────────────────────

ALTER TABLE public.location_business_config ENABLE ROW LEVEL SECURITY;

-- Lectura: cualquier membership activa en la location, cualquier rol
-- (mismo gate que financial_results / location_pos_config).
CREATE POLICY location_business_config_select
  ON public.location_business_config
  FOR SELECT
  TO authenticated
  USING (public.user_has_membership(location_id));

-- Escritura: solo WRITE_ROLES. La ruta /api hace el upsert real vía
-- service_role (bypassa RLS) — estas policies son la segunda capa,
-- no la única, para que un futuro insert/update client-side directo
-- no reabra el hueco que WRITE_ROLES existe para cerrar.
CREATE POLICY location_business_config_insert
  ON public.location_business_config
  FOR INSERT
  TO authenticated
  WITH CHECK (public.user_has_write_role(location_id));

CREATE POLICY location_business_config_update
  ON public.location_business_config
  FOR UPDATE
  TO authenticated
  USING (public.user_has_write_role(location_id))
  WITH CHECK (public.user_has_write_role(location_id));

GRANT SELECT, INSERT, UPDATE ON public.location_business_config TO authenticated;

-- ── RPC de lectura ─────────────────────────────────────────────
-- Devuelve SOLO las claves configuradas. Una key ausente del
-- resultado == no configurada; el caller (lib/business-config.ts)
-- nunca debe rellenar eso con 0.

CREATE OR REPLACE FUNCTION public.get_location_business_config(p_location_id uuid)
RETURNS TABLE (
  key        text,
  value      jsonb,
  unit       text,
  updated_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.key, c.value, c.unit, c.updated_at
  FROM location_business_config c
  WHERE c.location_id = p_location_id
    AND public.user_has_membership(p_location_id);
$$;

GRANT EXECUTE ON FUNCTION public.get_location_business_config(uuid) TO authenticated;
