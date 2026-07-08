-- ============================================================
-- Migration: CHECK constraint sobre memberships.role
-- Fecha: 2026-07-05
--
-- Sprint D — Roles, paso 1.
--
-- La columna role era text libre, sin ningún constraint que
-- validara su valor a nivel de DB (la validez dependía solo del
-- type Role en TypeScript). Un insert directo o vía Supabase
-- Studio podía dejar un string arbitrario en memberships.role.
--
-- Se agrega memberships_role_check restringiendo role a los 5
-- roles válidos: owner, manager, encargado, super_admin, staff.
--
-- Mismo SQL ya ejecutado y validado en STG.
-- ============================================================

ALTER TABLE public.memberships
  ADD CONSTRAINT memberships_role_check
  CHECK (role IN ('owner', 'manager', 'encargado', 'super_admin', 'staff'));
