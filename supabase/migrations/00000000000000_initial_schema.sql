-- ============================================================
-- Schema base - exportado de producción 2026-03-23
-- Idempotente: usa CREATE TABLE IF NOT EXISTS
-- ============================================================

-- 1. organizations
CREATE TABLE IF NOT EXISTS public.organizations (
  id         uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name       text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  slug       text UNIQUE,
  plan       text DEFAULT 'starter'
);

-- 2. profiles (referencia auth.users gestionada por Supabase Auth)
CREATE TABLE IF NOT EXISTS public.profiles (
  id          uuid NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role        text,
  org_id      uuid,
  location_id uuid,
  full_name   text,
  email       text
);

-- 3. locations
CREATE TABLE IF NOT EXISTS public.locations (
  id         uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id     uuid NOT NULL REFERENCES public.organizations(id),
  name       text NOT NULL,
  address    text,
  created_at timestamp with time zone DEFAULT now()
);

-- 4. memberships
CREATE TABLE IF NOT EXISTS public.memberships (
  id         uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    uuid REFERENCES public.profiles(id),
  org_id     uuid REFERENCES public.organizations(id),
  role       text NOT NULL,
  is_active  boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  UNIQUE (user_id, org_id)
);

-- 5. calendar_context
CREATE TABLE IF NOT EXISTS public.calendar_context (
  id              uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  fecha           date NOT NULL UNIQUE,
  es_feriado      boolean DEFAULT false,
  nombre_feriado  text,
  tipo            text,
  pais            text DEFAULT 'AR',
  created_at      timestamp with time zone DEFAULT now()
);

-- 6. sales_documents
CREATE TABLE IF NOT EXISTS public.sales_documents (
  id                  uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id              uuid NOT NULL REFERENCES public.organizations(id),
  location_id         uuid NOT NULL REFERENCES public.locations(id),
  external_id         text NOT NULL,
  sucursal            text,
  fecha               date,
  fecha_inicio        timestamp with time zone,
  fecha_cierre        timestamp with time zone,
  fecha_caja          date,
  hora                text,
  turno               text,
  anio_caja           text,
  mes                 text,
  mes_caja            text,
  dia                 text,
  dia_caja            text,
  total               numeric,
  descuento           numeric DEFAULT 0,
  recargo             numeric DEFAULT 0,
  iva_venta           text,
  comensales          integer,
  camarero            text,
  camarero_nombre     text,
  usuario             text,
  punto_venta         text,
  tipo_documento      text,
  tipo_zona           text,
  zona                text,
  tipo_sucursal       text,
  formas_pago         text,
  cliente             text,
  cantidad_documentos integer,
  obs_promocion       text,
  promocion           text,
  created_at          timestamp with time zone DEFAULT now(),
  UNIQUE (external_id, location_id)
);

-- 7. sales_items
CREATE TABLE IF NOT EXISTS public.sales_items (
  id                      uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id                  uuid NOT NULL REFERENCES public.organizations(id),
  location_id             uuid NOT NULL REFERENCES public.locations(id),
  external_id             text NOT NULL,
  codigo                  integer,
  numero_ticket           text,
  sucursal                text,
  punto_venta             text,
  camarero                text,
  camarero_nombre         text,
  apellido_nombre         text,
  tipo_documento          text,
  tipo_sucursal           text,
  fecha_inicio            timestamp with time zone,
  fecha_cierre            timestamp with time zone,
  fecha_caja              date,
  fecha_documento         date,
  fecha_item              timestamp with time zone,
  hora_item               text,
  dia_caja                text,
  mes_caja                text,
  anio_caja               text,
  turno                   text,
  nro_caja                integer,
  familia                 text,
  subfamilia              text,
  descripcion             text,
  marca                   text,
  es_variacion            text,
  tipo_zona               text,
  zona                    text,
  zona_id                 integer,
  cantidad                numeric,
  precio_unitario         numeric,
  descuento_item          numeric DEFAULT 0,
  recargo_item            numeric DEFAULT 0,
  descuento_global        numeric DEFAULT 0,
  recargo_global          numeric DEFAULT 0,
  precio_total            numeric,
  obs_promocion           text,
  promocion               text,
  observaciones_promocion text,
  created_at              timestamp with time zone DEFAULT now(),
  CONSTRAINT sales_items_unique_row UNIQUE (external_id, location_id, fecha_item, codigo)
);

-- 8. stock_movements
CREATE TABLE IF NOT EXISTS public.stock_movements (
  id             uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id         uuid NOT NULL REFERENCES public.organizations(id),
  location_id    uuid NOT NULL REFERENCES public.locations(id),
  external_id    text NOT NULL,
  sucursal       text,
  numero         text,
  tipo_documento text,
  descripcion    text,
  unidad_medida  text,
  cantidad       numeric,
  fecha          timestamp with time zone,
  observaciones  text,
  created_at     timestamp with time zone DEFAULT now(),
  UNIQUE (external_id, location_id)
);

-- 9. product_prices
CREATE TABLE IF NOT EXISTS public.product_prices (
  id            uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id        uuid NOT NULL REFERENCES public.organizations(id),
  location_id   uuid NOT NULL REFERENCES public.locations(id),
  external_id   text NOT NULL,
  codigo        integer,
  denominacion  text NOT NULL,
  familia       text,
  subfamilia    text,
  marca         text,
  unidad_medida text,
  tipo          text,
  tarifa        text,
  precio_venta  numeric,
  pantalla      text,
  created_at    timestamp with time zone DEFAULT now(),
  updated_at    timestamp with time zone DEFAULT now(),
  UNIQUE (external_id, location_id)
);

-- 10. financial_results
CREATE TABLE IF NOT EXISTS public.financial_results (
  id          uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id      uuid NOT NULL,
  location_id uuid NOT NULL,
  periodo     text NOT NULL,
  categoria   text NOT NULL,
  concepto    text NOT NULL,
  monto       numeric NOT NULL,
  created_at  timestamp with time zone DEFAULT now(),
  UNIQUE (org_id, location_id, periodo, concepto)
);

-- 11. recipes
CREATE TABLE IF NOT EXISTS public.recipes (
  id                  uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id              uuid NOT NULL REFERENCES public.organizations(id),
  location_id         uuid NOT NULL REFERENCES public.locations(id),
  external_id         text NOT NULL,
  articulo_padre      text NOT NULL,
  articulo_hijo       text NOT NULL,
  unidad_medida       text,
  cantidad            numeric,
  cantidad_receta     numeric,
  cantidad_por_cada   numeric,
  precio_costo        numeric,
  costo_proporcional  numeric,
  created_at          timestamp with time zone DEFAULT now(),
  UNIQUE (external_id, location_id)
);

-- 12. uploads
CREATE TABLE IF NOT EXISTS public.uploads (
  id              uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id          uuid NOT NULL REFERENCES public.organizations(id),
  location_id     uuid NOT NULL REFERENCES public.locations(id),
  file_name       text NOT NULL,
  file_type       text,
  status          text DEFAULT 'pending',
  rows_processed  integer DEFAULT 0,
  rows_inserted   integer DEFAULT 0,
  rows_skipped    integer DEFAULT 0,
  error_detail    text,
  uploaded_at     timestamp with time zone DEFAULT now()
);
