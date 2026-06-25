-- ============================================================
-- Migration 2/3: backfill item_hash for all existing sales_items
-- Date: 2026-06-24
--
-- Assigns occurrence = ROW_NUMBER()-1 within each content group
-- (location_id, numero_ticket, fecha_caja, descripcion, cantidad,
-- precio_total), ordered by id as a stable proxy for insertion order.
--
-- This correctly handles the pre-existing duplicate rows that were
-- the cause of the ~358 missing items: two identical rows in the
-- same ticket now get occurrence 0 and 1, giving them distinct hashes.
--
-- After this migration, item_hash is NOT NULL for all rows.
-- Safe to run multiple times (idempotent via the WHERE clause).
-- ============================================================

UPDATE public.sales_items si
SET item_hash = public.generate_item_hash(
  si.numero_ticket,
  si.fecha_caja,
  si.descripcion,
  si.cantidad,
  si.precio_total,
  ranked.occurrence
)
FROM (
  SELECT
    id,
    (ROW_NUMBER() OVER (
      PARTITION BY
        location_id,
        numero_ticket,
        fecha_caja,
        descripcion,
        cantidad,
        precio_total
      ORDER BY id    -- stable proxy for original insertion / file order
    ) - 1)::int AS occurrence
  FROM public.sales_items
) ranked
WHERE si.id = ranked.id
  AND si.item_hash IS NULL;
