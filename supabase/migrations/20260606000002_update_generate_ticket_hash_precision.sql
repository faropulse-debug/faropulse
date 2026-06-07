-- ============================================================
-- Migration: update generate_ticket_hash to normalize money precision
-- Date: 2026-06-06
--
-- Mirrors the TypeScript fix: total, descuento, recargo are rounded
-- to 2 decimal places before hashing (ROUND(x, 2)::text), matching
-- Number(n).toFixed(2) in the TypeScript generate-ticket-hash.ts.
-- This ensures the DB-side function stays consistent with the
-- application-side hash if ever called directly.
-- ============================================================

CREATE OR REPLACE FUNCTION public.generate_ticket_hash(
  p_external_id    TEXT,
  p_fecha_caja     DATE,
  p_hora           TEXT,
  p_camarero       TEXT,
  p_total          NUMERIC,
  p_comensales     INTEGER,
  p_cliente        TEXT,
  p_tipo_documento TEXT,
  p_punto_venta    TEXT,
  p_zona           TEXT,
  p_descuento      NUMERIC,
  p_recargo        NUMERIC
) RETURNS TEXT
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  -- ROUND(x, 2)::text on NUMERIC preserves trailing zeros (e.g. 10000 → '10000.00'),
  -- matching JavaScript's Number(n).toFixed(2) exactly.
  SELECT encode(sha256(concat(
    coalesce(p_external_id::text,                    ''), '|',
    coalesce(p_fecha_caja::text,                     ''), '|',
    coalesce(p_hora::text,                           ''), '|',
    coalesce(p_camarero::text,                       ''), '|',
    coalesce(ROUND(p_total::numeric,     2)::text,   ''), '|',
    coalesce(p_comensales::text,                     ''), '|',
    coalesce(p_cliente::text,                        ''), '|',
    coalesce(p_tipo_documento::text,                 ''), '|',
    coalesce(p_punto_venta::text,                    ''), '|',
    coalesce(p_zona::text,                           ''), '|',
    coalesce(ROUND(p_descuento::numeric, 2)::text,   ''), '|',
    coalesce(ROUND(p_recargo::numeric,   2)::text,   '')
  )::bytea), 'hex')
$$;

GRANT EXECUTE ON FUNCTION public.generate_ticket_hash TO anon, authenticated, service_role;
