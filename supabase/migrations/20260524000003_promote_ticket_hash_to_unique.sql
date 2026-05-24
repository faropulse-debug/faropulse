-- Promote ticket_hash index to UNIQUE constraint after successful backfill
-- Validated: 13,576 hashes, 0 collisions, including 60 docs that share external_id 'B 00002-00000009'

DROP INDEX IF EXISTS idx_sales_documents_ticket_hash;
CREATE UNIQUE INDEX idx_sales_documents_ticket_hash_unique
ON public.sales_documents(location_id, ticket_hash);
