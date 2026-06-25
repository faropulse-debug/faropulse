-- ============================================================
-- Migration 3/3: promote item_hash to UNIQUE + drop old constraint
-- Date: 2026-06-24
--
-- Precondition: migration 2 must have run (item_hash NOT NULL for
-- all rows, no duplicates within (location_id, item_hash)).
--
-- Also drops the legacy 4-field constraint sales_items_unique_row
-- (external_id, location_id, fecha_item, codigo), which was the
-- direct cause of silent INSERT failures when two identical items
-- in the same ticket shared the same (fecha_item, codigo) values.
-- item_hash is now the sole uniqueness arbiter for sales_items.
--
-- Pattern mirrors sales_documents / ticket_hash promotion.
-- ============================================================

-- Promote to unique (drop non-unique first to avoid duplicate index)
DROP INDEX IF EXISTS idx_sales_items_item_hash;

CREATE UNIQUE INDEX idx_sales_items_item_hash_unique
  ON public.sales_items(location_id, item_hash);

-- Drop legacy 4-field constraint — replaced by item_hash uniqueness
ALTER TABLE public.sales_items
  DROP CONSTRAINT IF EXISTS sales_items_unique_row;
