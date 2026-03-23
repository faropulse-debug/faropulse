-- ============================================================
-- Seed: Pizzería Demo — datos de prueba para staging
-- Generado: 2026-03-23
--
-- Idempotente: ON CONFLICT DO NOTHING en todos los inserts.
-- UUIDs fijos para reproducibilidad entre ejecuciones.
--
-- Contenido:
--   1 organization, 1 location, 1 user (owner@demo.com / Demo1234!)
--   50 sales_documents (últimos 3 meses)
--   200 sales_items vinculados (4 por documento)
--   3 documentos con descuento 100% (SEED-0005, SEED-0020, SEED-0035)
--   ~10 documentos con camarero NULL
-- ============================================================

-- ── 1. Organization ──────────────────────────────────────────
INSERT INTO public.organizations (id, name, slug, plan)
VALUES (
  'aaaaaaaa-0000-0000-0000-000000000001',
  'Pizzería Demo',
  'pizzeria-demo',
  'starter'
)
ON CONFLICT (id) DO NOTHING;

-- ── 2. Location ──────────────────────────────────────────────
INSERT INTO public.locations (id, org_id, name, address)
VALUES (
  'bbbbbbbb-0000-0000-0000-000000000001',
  'aaaaaaaa-0000-0000-0000-000000000001',
  'Demo Ituzaingó',
  'Av. Rivadavia 1234, Ituzaingó, Buenos Aires'
)
ON CONFLICT (id) DO NOTHING;

-- ── 3. Auth user (email: owner@demo.com / pass: Demo1234!) ───
INSERT INTO auth.users (
  id, aud, role, email,
  encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at,
  is_sso_user, is_anonymous
)
VALUES (
  'cccccccc-0000-0000-0000-000000000001',
  'authenticated', 'authenticated',
  'owner@demo.com',
  crypt('Demo1234!', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"full_name":"Owner Demo"}'::jsonb,
  now(), now(),
  false, false
)
ON CONFLICT (id) DO NOTHING;

-- ── 4. Profile ───────────────────────────────────────────────
INSERT INTO public.profiles (id, role, org_id, location_id, full_name, email)
VALUES (
  'cccccccc-0000-0000-0000-000000000001',
  'owner',
  'aaaaaaaa-0000-0000-0000-000000000001',
  'bbbbbbbb-0000-0000-0000-000000000001',
  'Owner Demo',
  'owner@demo.com'
)
ON CONFLICT (id) DO NOTHING;

-- ── 5. Membership ────────────────────────────────────────────
INSERT INTO public.memberships (user_id, org_id, role, is_active)
VALUES (
  'cccccccc-0000-0000-0000-000000000001',
  'aaaaaaaa-0000-0000-0000-000000000001',
  'owner',
  true
)
ON CONFLICT (user_id, org_id) DO NOTHING;

-- ── 6. Sales documents (50) y items (200) ────────────────────
-- Fecha base: 2025-12-23 (90 días antes de la generación del seed)
-- Doc i → fecha base + round(i * 90 / 50) días
-- Camarero NULL: i % 6 = 0 ó i % 7 = 0  (~10 docs)
-- Descuento 100%: i IN (5, 20, 35)
DO $$
DECLARE
  v_org_id    constant uuid := 'aaaaaaaa-0000-0000-0000-000000000001';
  v_loc_id    constant uuid := 'bbbbbbbb-0000-0000-0000-000000000001';
  v_base_date constant date := '2025-12-23';

  productos   text[]    := ARRAY[
    'Pizza Mozzarella',   'Pizza Fugazza',       'Pizza Especial',
    'Pizza Cuatro Quesos','Pizza Napolitana',    'Empanada de Carne',
    'Coca Cola 600ml',    'Agua sin gas 500ml',  'Cerveza Quilmes 500ml',
    'Vino Copa Malbec',   'Helado 2 bochas',     'Brownie con helado'
  ];
  familias    text[]    := ARRAY[
    'Pizzas',  'Pizzas',  'Pizzas',  'Pizzas',  'Pizzas',  'Entradas',
    'Bebidas', 'Bebidas', 'Bebidas', 'Bebidas', 'Postres', 'Postres'
  ];
  precios     numeric[] := ARRAY[
    2500, 2800, 3200, 3000, 2700,  800,
     900,  500, 1200,  950, 1100, 1300
  ];
  camareros   text[]    := ARRAY['Carlos','María','Juan','Ana','Pedro','Lucas'];
  zonas       text[]    := ARRAY['Salón','Terraza','Barra'];
  formas_pago text[]    := ARRAY['Efectivo','Tarjeta débito','Tarjeta crédito','QR/Transferencia'];

  i            int;
  j            int;
  doc_date     date;
  hora_h       int;
  hora_m       int;
  hora_str     text;
  cam_val      text;
  zona_val     text;
  fp_val       text;
  turno_val    text;
  ticket_num   text;
  prod_idx     int;
  item_cant    numeric;
  item_precio  numeric;
  total_doc    numeric;
  desc_doc     numeric;
  is_100pct    bool;
  comensales_v int;
BEGIN
  FOR i IN 1..50 LOOP
    -- Fecha determinística distribuida en los últimos 90 días
    doc_date    := v_base_date + round(i::numeric * 90 / 50)::int;

    -- Hora determinística entre 11:00 y 22:59
    hora_h      := 11 + (i % 12);
    hora_m      := (i * 7) % 60;
    hora_str    := lpad(hora_h::text, 2, '0') || ':' || lpad(hora_m::text, 2, '0');
    turno_val   := CASE WHEN hora_h < 16 THEN 'Mediodía' ELSE 'Noche' END;

    ticket_num  := 'SEED-' || lpad(i::text, 4, '0');
    zona_val    := zonas   [1 + (i % 3)];
    fp_val      := formas_pago[1 + (i % 4)];
    comensales_v := 1 + (i % 5);

    -- Camarero NULL en ~10 documentos
    IF i % 6 = 0 OR i % 7 = 0 THEN
      cam_val := NULL;
    ELSE
      cam_val := camareros[1 + (i % 6)];
    END IF;

    -- Docs con descuento 100%
    is_100pct := i IN (5, 20, 35);

    -- Calcular total sumando los 4 ítems del documento
    total_doc := 0;
    FOR j IN 1..4 LOOP
      prod_idx  := 1 + ((i + j - 1) % 12);
      item_cant := 1 + (j % 3);          -- 1, 2, 3, 1
      total_doc := total_doc + item_cant * precios[prod_idx];
    END LOOP;

    desc_doc := CASE WHEN is_100pct THEN total_doc ELSE 0 END;

    -- ── Insert document ─────────────────────────────────────
    INSERT INTO public.sales_documents (
      org_id, location_id, external_id,
      sucursal, fecha, fecha_caja, hora, turno,
      anio_caja, mes, mes_caja, dia, dia_caja,
      total, descuento, recargo,
      comensales, camarero, punto_venta,
      tipo_documento, tipo_zona, zona,
      formas_pago, cantidad_documentos
    ) VALUES (
      v_org_id, v_loc_id,
      ticket_num,
      'Ituzaingó', doc_date, doc_date, hora_str, turno_val,
      extract(year  from doc_date)::text,
      lpad(extract(month from doc_date)::text, 2, '0'),
      lpad(extract(month from doc_date)::text, 2, '0'),
      lpad(extract(day   from doc_date)::text, 2, '0'),
      lpad(extract(day   from doc_date)::text, 2, '0'),
      total_doc, desc_doc, 0,
      comensales_v,
      cam_val,
      '1',
      'Comanda',
      'Interior', zona_val,
      fp_val,
      1
    )
    ON CONFLICT (external_id, location_id) DO NOTHING;

    -- ── Insert 4 items por documento ────────────────────────
    FOR j IN 1..4 LOOP
      prod_idx   := 1 + ((i + j - 1) % 12);
      item_cant  := 1 + (j % 3);
      item_precio := precios[prod_idx];

      INSERT INTO public.sales_items (
        org_id, location_id, external_id, codigo,
        numero_ticket, sucursal, punto_venta,
        camarero, tipo_documento, tipo_sucursal,
        fecha_caja, fecha_item, hora_item,
        dia_caja, mes_caja, anio_caja,
        familia, descripcion,
        tipo_zona, zona,
        cantidad, precio_unitario,
        descuento_item, recargo_item,
        descuento_global, recargo_global,
        precio_total
      ) VALUES (
        v_org_id, v_loc_id,
        ticket_num || '-ITEM-' || j,
        prod_idx * 100,
        ticket_num,
        'Ituzaingó', '1',
        cam_val,
        'Comanda', 'Restaurante',
        doc_date,
        doc_date::timestamp + make_interval(hours => hora_h, mins => hora_m + j * 3),
        hora_str,
        lpad(extract(day   from doc_date)::text, 2, '0'),
        lpad(extract(month from doc_date)::text, 2, '0'),
        extract(year from doc_date)::text,
        familias[prod_idx], productos[prod_idx],
        'Interior', zona_val,
        item_cant, item_precio,
        0, 0,
        CASE WHEN is_100pct THEN 100 ELSE 0 END, 0,
        item_cant * item_precio
      )
      ON CONFLICT (external_id, location_id, fecha_item, codigo) DO NOTHING;
    END LOOP;

  END LOOP;
END $$;
