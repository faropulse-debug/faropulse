-- Amplía get_ventas_cascada_semanal a un parámetro de cantidad de semanas
-- (p_semanas DEFAULT 12) para que Tano pueda ver un trimestre y captar
-- estacionalidad. Antes devolvía siempre 8 semanas fijas.
--
-- Diseño: un solo parámetro con DEFAULT en vez de devolver siempre 12 y
-- recortar en el frontend — le da al caller control real sobre el rango sin
-- traer de más, y evita que cada consumidor futuro reimplemente el recorte.
--
-- Compatibilidad: DROP + CREATE (no CREATE OR REPLACE) porque agregar un
-- parámetro cambia la firma — Postgres trataría la firma vieja
-- get_ventas_cascada_semanal(uuid) y la nueva (uuid, int) como funciones
-- distintas si se usa CREATE OR REPLACE, dejando el criterio viejo (8
-- semanas fijas) duplicado y sin el fix. Con DEFAULT 12 en el único
-- parámetro nuevo, una llamada existente con 1 solo argumento
-- (get_ventas_cascada_semanal(location_id)) sigue resolviendo contra esta
-- misma función — no rompe la UI actual.
--
-- Todo lo demás igual: semana ISO lunes-domingo, fecha_caja, documento_peso().

DROP FUNCTION IF EXISTS public.get_ventas_cascada_semanal(uuid);

CREATE FUNCTION public.get_ventas_cascada_semanal(p_location_id uuid, p_semanas int DEFAULT 12)
RETURNS TABLE (semana date, ventas numeric, pedidos bigint, comensales bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    DATE_TRUNC('week', d.fecha_caja)::date                        AS semana,
    SUM(d.total)                                                   AS ventas,
    SUM(public.documento_peso(d.tipo_documento, d.total))::bigint  AS pedidos,
    SUM(d.comensales)                                              AS comensales
  FROM sales_documents d
  WHERE d.location_id = p_location_id
    AND d.fecha_caja >= DATE_TRUNC('week', CURRENT_DATE) - ((p_semanas - 1) * INTERVAL '1 week')
    AND public.user_has_membership(p_location_id)
  GROUP BY DATE_TRUNC('week', d.fecha_caja)
  ORDER BY semana;
$$;
GRANT EXECUTE ON FUNCTION public.get_ventas_cascada_semanal(uuid, int) TO anon, authenticated, service_role;
