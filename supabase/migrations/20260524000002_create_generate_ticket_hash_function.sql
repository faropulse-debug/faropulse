-- Generate deterministic SHA256 hash for ticket idempotency
-- Composition: 12 stable identifying fields from POS Excel
-- Validated: 0 collisions across 13,576 docs in STG

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
  SELECT encode(sha256(concat(
    coalesce(p_external_id::text, ''), '|',
    coalesce(p_fecha_caja::text, ''), '|',
    coalesce(p_hora::text, ''), '|',
    coalesce(p_camarero::text, ''), '|',
    coalesce(p_total::text, ''), '|',
    coalesce(p_comensales::text, ''), '|',
    coalesce(p_cliente::text, ''), '|',
    coalesce(p_tipo_documento::text, ''), '|',
    coalesce(p_punto_venta::text, ''), '|',
    coalesce(p_zona::text, ''), '|',
    coalesce(p_descuento::text, ''), '|',
    coalesce(p_recargo::text, '')
  )::bytea), 'hex')
$$;

GRANT EXECUTE ON FUNCTION public.generate_ticket_hash TO anon, authenticated, service_role;
