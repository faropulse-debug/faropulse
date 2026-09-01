-- upload_events no registraba quien disparo cada evento. requireMembership()
-- ya resuelve el userId del caller en cada endpoint de upload (POST /api/upload/*)
-- pero la variable se descartaba despues de la verificacion de membership --
-- nunca llegaba a recordEvent(). Consecuencia directa: el incidente del
-- 2026-08-30 (11 filas subidas a mano en detalle-gap-cortesias.xlsx) no pudo
-- atribuirse a una cuenta especifica pese a tener el evento de upload completo,
-- porque ninguna fila de upload_events guarda el actor.
--
-- Columna aditiva y nullable: las filas historicas (incluidas las del propio
-- incidente) quedan en NULL. Eso es correcto, no un placeholder -- para esos
-- eventos no se puede reconstruir el actor de forma confiable, y NULL dice
-- exactamente eso ("no sabemos quien fue") en vez de fabricar un valor.
ALTER TABLE public.upload_events
  ADD COLUMN actor_user_id uuid REFERENCES auth.users(id);

COMMENT ON COLUMN public.upload_events.actor_user_id IS
  'userId resuelto por requireMembership() para el request que genero el evento. NULL en filas anteriores a esta migracion -- no se puede reconstruir el actor retroactivamente.';
