-- RPC: get_ventas_por_franja — distribución por franja horaria (últimos 6 meses).
-- Campo hora (text, cobertura 100%): fecha_inicio/fecha_cierre son NULL en todos los registros.
-- Formato de hora: entero ('21') o HH:MM ('00:00') → SPLIT_PART(...,':',1)::integer extrae la hora.
-- Franjas: Mediodía 12-15h, Tarde 16-19h, Noche 20-23h, Madrugada resto (0-11h y otros).
-- Smoke-test mayo 2026: Tarde=$3,288,780/61p · Noche=$36,814,477/626p · Madrugada=$94,100/4p
--   → suma $40,197,357 / 691 pedidos.

CREATE OR REPLACE FUNCTION public.get_ventas_por_franja(p_location_id uuid)
RETURNS TABLE (
  mes     text,
  franja  text,
  ventas  numeric,
  pedidos bigint
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    TO_CHAR(d.fecha::date, 'YYYY-MM')   AS mes,
    CASE
      WHEN d.hora IS NULL OR d.hora = '' OR d.hora !~ '^\d'
        THEN 'Madrugada'
      WHEN SPLIT_PART(d.hora, ':', 1)::integer BETWEEN 12 AND 15
        THEN 'Mediodía'
      WHEN SPLIT_PART(d.hora, ':', 1)::integer BETWEEN 16 AND 19
        THEN 'Tarde'
      WHEN SPLIT_PART(d.hora, ':', 1)::integer BETWEEN 20 AND 23
        THEN 'Noche'
      ELSE 'Madrugada'
    END                                  AS franja,
    SUM(d.total)                         AS ventas,
    COUNT(*)::bigint                     AS pedidos
  FROM sales_documents d
  WHERE d.location_id = p_location_id
    AND d.fecha >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '5 months'
    AND public.user_has_membership(p_location_id)
  GROUP BY
    TO_CHAR(d.fecha::date, 'YYYY-MM'),
    CASE
      WHEN d.hora IS NULL OR d.hora = '' OR d.hora !~ '^\d'
        THEN 'Madrugada'
      WHEN SPLIT_PART(d.hora, ':', 1)::integer BETWEEN 12 AND 15
        THEN 'Mediodía'
      WHEN SPLIT_PART(d.hora, ':', 1)::integer BETWEEN 16 AND 19
        THEN 'Tarde'
      WHEN SPLIT_PART(d.hora, ':', 1)::integer BETWEEN 20 AND 23
        THEN 'Noche'
      ELSE 'Madrugada'
    END
  ORDER BY mes, ventas DESC;
$$;

GRANT EXECUTE ON FUNCTION public.get_ventas_por_franja(uuid) TO anon, authenticated, service_role;
