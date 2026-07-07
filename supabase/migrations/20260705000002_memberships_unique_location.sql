-- ============================================================
-- Migration: memberships UNIQUE constraint moves to (user_id, location_id)
-- Fecha: 2026-07-05
--
-- Multi-location migrate — cambio de constraint.
--
-- La UNIQUE constraint de memberships era (user_id, org_id). Eso
-- impedía que un mismo usuario tuviera más de una membership
-- activa dentro de la misma organización (una por location).
-- Con memberships.location_id ya poblado, la unicidad pasa a
-- (user_id, location_id): un usuario puede tener varias
-- memberships en el mismo org, una por local.
--
-- Mismo SQL ya ejecutado y validado en STG.
-- ============================================================

ALTER TABLE public.memberships
  DROP CONSTRAINT memberships_user_id_org_id_key;

ALTER TABLE public.memberships
  ADD CONSTRAINT memberships_user_id_location_id_key UNIQUE (user_id, location_id);
