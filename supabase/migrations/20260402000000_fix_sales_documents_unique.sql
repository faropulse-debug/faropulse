-- ============================================================
-- Migration: fix UNIQUE constraint en sales_documents
-- Fecha: 2026-04-02
--
-- Problema: el constraint (external_id, location_id) rechaza
-- documentos distintos que comparten número (ej. 26 ventas del
-- 22/03 con numero B 00002-00000009 pero distintos totales).
-- Caso real: múltiples transacciones con el mismo número de
-- documento pero importes diferentes.
--
-- Fix: incluir total en el constraint para distinguirlos.
-- Idempotente: safe to re-run.
-- ============================================================

ALTER TABLE public.sales_documents
  DROP CONSTRAINT IF EXISTS sales_documents_external_id_location_id_key;

ALTER TABLE public.sales_documents
  DROP CONSTRAINT IF EXISTS sales_documents_unique_doc;

ALTER TABLE public.sales_documents
  ADD CONSTRAINT sales_documents_unique_doc
  UNIQUE (external_id, location_id, total);
