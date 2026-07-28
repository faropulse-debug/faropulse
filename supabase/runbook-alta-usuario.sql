-- ============================================================================
-- RUNBOOK — Alta de usuario (profiles + membership) en un local existente.
--
-- Precondición: el usuario YA existe en Supabase Auth (alta manual o vía
-- Admin API). Eso dispara el trigger on_auth_user_created -> handle_new_user()
-- (supabase/migrations/20260728000001_fix_handle_new_user_avatar_url.sql),
-- que crea la fila de public.profiles con id/email/full_name. Este script NO
-- crea usuarios en Auth — solo completa profiles y crea la membership.
--
-- Reutilizable: reemplazá los 5 placeholders de abajo y corré el bloque.
-- La función es idempotente para memberships (ON CONFLICT user_id+location_id)
-- y falla explícito si el usuario no existe todavía en Auth/profiles.
--
-- ⚠️ LEER ANTES DE APLICAR: 'manager' NO es de solo lectura hoy. Ver nota al
-- final del archivo — no lo agregué como comentario suelto para que no se
-- pierda en el copy/paste.
-- ============================================================================

SELECT public.provision_membership(
  '<USER_UID_AQUI>',                         -- UUID de auth.users (el que te pasaron)
  '<ORG_ID_AQUI>',                           -- org_id del local
  '<LOCATION_ID_AQUI>',                      -- location_id del local
  '<ROLE_AQUI>',                             -- owner | manager | encargado | super_admin | staff
  '<NOMBRE_COMPLETO_AQUI>'                   -- opcional: NULL para dejar el full_name que puso el trigger
);

-- ============================================================================
-- VERIFICACIÓN (read-only) — correr después, reemplazando el UUID.
-- ============================================================================

SELECT
  p.id, p.full_name, p.email, p.role AS profile_role,
  m.role AS membership_role, m.is_active, m.location_id, m.org_id,
  l.name AS location_name
FROM public.profiles p
JOIN public.memberships m ON m.user_id = p.id
JOIN public.locations l ON l.id = m.location_id
WHERE p.id = '<USER_UID_AQUI>';

-- ============================================================================
-- NOTA IMPORTANTE — 'manager' no es de solo lectura hoy, pero desde
-- 6ae1ab4 (2026-07-27) ya no es funcionalmente idéntico a 'owner'. Estado
-- actual (main = lo que corre en PROD), no repetir el error de dar por
-- sentado que esto sigue igual sin releer el código primero:
--
-- proxy.ts (navegación de páginas): tanto /dashboard/owner/* como
-- /dashboard/manager/* (y cualquier otra ruta /dashboard/*) siguen exigiendo
-- el MISMO set de 5 roles — {owner, manager, encargado, super_admin, staff} —
-- sin diferenciar por rol qué prefijo puede pisar cada uno. Un 'manager'
-- todavía puede navegar a /dashboard/owner, el middleware lo deja pasar
-- igual. Esto NO cambió.
--
-- lib/api-auth.ts + lib/authz.ts (requireMembership + WRITE_ROLES): esto SÍ
-- cambió. Las 6 rutas mutantes (upload/sales, upload/items,
-- upload/[contract_id], upload/cucinago, upload/financial, pnl) ahora pasan
-- opts.roles: WRITE_ROLES = ['owner', 'super_admin']. Un 'manager' YA NO
-- puede subir archivos ni escribir P&L — 403 Forbidden. La única ruta que
-- sigue sin gate de role es reconcile/cucinago (verificada read-only:
-- fetch + diff, sin escritura), donde cualquier membership activa alcanza.
--
-- Conclusión: 'manager' hoy puede navegar a cualquier pantalla de
-- /dashboard/* (incluida la de owner) pero no puede ejecutar las 6 acciones
-- de escritura de arriba. Sigue sin ser "solo lectura" en sentido estricto
-- (navegación irrestricta + reconcile abierto), pero ya no es "igual a
-- owner" como era antes del 2026-07-27. Si lo que se busca es solo-lectura
-- real (navegación incluida), esa granularidad todavía no existe en
-- proxy.ts.
-- ============================================================================
