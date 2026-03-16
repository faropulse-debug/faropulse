-- ============================================================
-- Migration: RLS, constraints y grants para tablas de datos
-- Fecha: 2026-03-15
--
-- Idempotente: se puede correr múltiples veces sin error.
-- Tablas afectadas:
--   sales_documents, stock_movements, product_prices,
--   financial_results, uploads
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- HELPER: función auxiliar de membresía (reutilizada por todas
-- las policies). Devuelve TRUE si el usuario autenticado tiene
-- una membresía activa cuya organización incluye la location.
--
-- La tabla memberships NO tiene location_id directamente.
-- La relación es: memberships.org_id → locations.org_id → locations.id
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.user_has_membership(p_location_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM memberships m
    JOIN locations l ON l.org_id = m.org_id
    WHERE m.user_id   = auth.uid()
      AND m.is_active = true
      AND l.id        = p_location_id
  );
$$;

GRANT EXECUTE ON FUNCTION public.user_has_membership(uuid) TO authenticated;


-- ============================================================
-- 1. sales_documents
-- ============================================================

-- 1a. Unique constraint
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'sales_documents_external_id_location_id_key'
      AND table_name      = 'sales_documents'
  ) THEN
    ALTER TABLE public.sales_documents
      ADD CONSTRAINT sales_documents_external_id_location_id_key
      UNIQUE (external_id, location_id);
  END IF;
END $$;

-- 1b. Habilitar RLS
ALTER TABLE public.sales_documents ENABLE ROW LEVEL SECURITY;

-- 1c. Policies
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'sales_documents'
      AND policyname = 'sales_documents_select'
  ) THEN
    CREATE POLICY sales_documents_select
      ON public.sales_documents
      FOR SELECT
      TO authenticated
      USING (public.user_has_membership(location_id));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'sales_documents'
      AND policyname = 'sales_documents_insert'
  ) THEN
    CREATE POLICY sales_documents_insert
      ON public.sales_documents
      FOR INSERT
      TO authenticated
      WITH CHECK (public.user_has_membership(location_id));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'sales_documents'
      AND policyname = 'sales_documents_delete'
  ) THEN
    CREATE POLICY sales_documents_delete
      ON public.sales_documents
      FOR DELETE
      TO authenticated
      USING (public.user_has_membership(location_id));
  END IF;
END $$;

-- 1d. Grants
GRANT SELECT, INSERT, DELETE ON public.sales_documents TO authenticated;


-- ============================================================
-- 2. stock_movements
-- ============================================================

-- 2a. Unique constraint
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'stock_movements_external_id_location_id_key'
      AND table_name      = 'stock_movements'
  ) THEN
    ALTER TABLE public.stock_movements
      ADD CONSTRAINT stock_movements_external_id_location_id_key
      UNIQUE (external_id, location_id);
  END IF;
END $$;

-- 2b. Habilitar RLS
ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;

-- 2c. Policies
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'stock_movements'
      AND policyname = 'stock_movements_select'
  ) THEN
    CREATE POLICY stock_movements_select
      ON public.stock_movements
      FOR SELECT
      TO authenticated
      USING (public.user_has_membership(location_id));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'stock_movements'
      AND policyname = 'stock_movements_insert'
  ) THEN
    CREATE POLICY stock_movements_insert
      ON public.stock_movements
      FOR INSERT
      TO authenticated
      WITH CHECK (public.user_has_membership(location_id));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'stock_movements'
      AND policyname = 'stock_movements_delete'
  ) THEN
    CREATE POLICY stock_movements_delete
      ON public.stock_movements
      FOR DELETE
      TO authenticated
      USING (public.user_has_membership(location_id));
  END IF;
END $$;

-- 2d. Grants
GRANT SELECT, INSERT, DELETE ON public.stock_movements TO authenticated;


-- ============================================================
-- 3. product_prices
-- ============================================================

-- 3a. Unique constraint
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'product_prices_external_id_location_id_key'
      AND table_name      = 'product_prices'
  ) THEN
    ALTER TABLE public.product_prices
      ADD CONSTRAINT product_prices_external_id_location_id_key
      UNIQUE (external_id, location_id);
  END IF;
END $$;

-- 3b. Habilitar RLS
ALTER TABLE public.product_prices ENABLE ROW LEVEL SECURITY;

-- 3c. Policies
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'product_prices'
      AND policyname = 'product_prices_select'
  ) THEN
    CREATE POLICY product_prices_select
      ON public.product_prices
      FOR SELECT
      TO authenticated
      USING (public.user_has_membership(location_id));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'product_prices'
      AND policyname = 'product_prices_insert'
  ) THEN
    CREATE POLICY product_prices_insert
      ON public.product_prices
      FOR INSERT
      TO authenticated
      WITH CHECK (public.user_has_membership(location_id));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'product_prices'
      AND policyname = 'product_prices_delete'
  ) THEN
    CREATE POLICY product_prices_delete
      ON public.product_prices
      FOR DELETE
      TO authenticated
      USING (public.user_has_membership(location_id));
  END IF;
END $$;

-- 3d. Grants
GRANT SELECT, INSERT, DELETE ON public.product_prices TO authenticated;


-- ============================================================
-- 4. financial_results
-- ============================================================

-- 4a. Unique constraint
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'financial_results_periodo_concepto_location_id_key'
      AND table_name      = 'financial_results'
  ) THEN
    ALTER TABLE public.financial_results
      ADD CONSTRAINT financial_results_periodo_concepto_location_id_key
      UNIQUE (periodo, concepto, location_id);
  END IF;
END $$;

-- 4b. Habilitar RLS
ALTER TABLE public.financial_results ENABLE ROW LEVEL SECURITY;

-- 4c. Policies
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'financial_results'
      AND policyname = 'financial_results_select'
  ) THEN
    CREATE POLICY financial_results_select
      ON public.financial_results
      FOR SELECT
      TO authenticated
      USING (public.user_has_membership(location_id));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'financial_results'
      AND policyname = 'financial_results_insert'
  ) THEN
    CREATE POLICY financial_results_insert
      ON public.financial_results
      FOR INSERT
      TO authenticated
      WITH CHECK (public.user_has_membership(location_id));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'financial_results'
      AND policyname = 'financial_results_delete'
  ) THEN
    CREATE POLICY financial_results_delete
      ON public.financial_results
      FOR DELETE
      TO authenticated
      USING (public.user_has_membership(location_id));
  END IF;
END $$;

-- 4d. Grants
GRANT SELECT, INSERT, DELETE ON public.financial_results TO authenticated;


-- ============================================================
-- 5. uploads  (sin constraint UNIQUE)
-- ============================================================

-- 5a. Habilitar RLS
ALTER TABLE public.uploads ENABLE ROW LEVEL SECURITY;

-- 5b. Policies
--   SELECT/INSERT filtran por location_id del upload.
--   No se permite DELETE desde el cliente (es tabla de auditoría).
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'uploads'
      AND policyname = 'uploads_select'
  ) THEN
    CREATE POLICY uploads_select
      ON public.uploads
      FOR SELECT
      TO authenticated
      USING (public.user_has_membership(location_id));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'uploads'
      AND policyname = 'uploads_insert'
  ) THEN
    CREATE POLICY uploads_insert
      ON public.uploads
      FOR INSERT
      TO authenticated
      WITH CHECK (public.user_has_membership(location_id));
  END IF;
END $$;

-- 5c. Grants  (sin DELETE — uploads es inmutable desde el cliente)
GRANT SELECT, INSERT ON public.uploads TO authenticated;
