-- ============================================================
-- Migration: memberships gana location_id (columna aditiva)
-- Fecha: 2026-07-05
--
-- Multi-location migrate — paso 0 (prerequisito de los pasos
-- 1-3 de este mismo día: user_has_membership_direct,
-- memberships_unique_location, memberships_role_check).
--
-- Hasta ahora memberships solo tenía org_id; la relación hacia
-- una location concreta era indirecta (org_id → locations.org_id
-- → locations.id), por eso user_has_membership necesitaba JOIN.
--
-- location_id se agrega como columna ADITIVA: convive con org_id,
-- no lo reemplaza ni lo borra. org_id sigue siendo la relación de
-- organización; location_id fija el local específico dentro de
-- esa organización para habilitar memberships multi-location
-- (un mismo usuario, varias locations del mismo org).
--
-- El backfill puebla location_id en filas existentes buscando la
-- (única, hoy) location de cada org. Si una org llegara a tener
-- más de una location antes de correr esto, el backfill deja esas
-- filas con location_id NULL — requeriría asignación manual.
--
-- Mismo SQL ya ejecutado y validado manualmente en STG.
-- ============================================================

ALTER TABLE public.memberships
  ADD COLUMN IF NOT EXISTS location_id uuid REFERENCES public.locations(id);

UPDATE public.memberships m
SET location_id = l.id
FROM public.locations l
WHERE l.org_id = m.org_id
  AND m.location_id IS NULL;
