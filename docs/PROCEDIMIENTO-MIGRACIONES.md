# Procedimiento estándar — aplicar una migración a mano

**Origen:** la semana del 2026-09-01 una migración se aplicó a mano en PROD **antes** que en STG — al revés de la doctrina que ya describía `docs/GUIA-OPERATIVA-AMBIENTES.md` §4 ("Flujo de migraciones"). Nadie lo detectó en el momento: no hubo error visible al aplicar el `ALTER TABLE`, y ninguna herramienta comparaba la estructura entre ambientes. El síntoma llegó después y de costado — un upload real rompió con `PGRST204` ("column not found in schema cache"), porque **PostgREST cachea el esquema en memoria al arrancar y no lo invalida solo cuando corre un `ALTER TABLE`**. La migración había corrido; el cache de PostgREST no se enteró.

Este documento es el procedimiento que reemplaza esa versión de 4 pasos, corta y sin verificación, por uno explícito y con un chequeo automatizado en el medio.

---

## El procedimiento

1. **Aplicar la migración en STG.** Nunca en PROD primero, sin excepción — STG es siempre el primer ambiente que ve un cambio de esquema.
2. **`NOTIFY pgrst, 'reload schema';` en STG.** Ver la sección de abajo para cuándo hace falta. Sin esto, cualquier endpoint que dependa del cambio (una columna nueva en un `INSERT`/`SELECT` vía PostgREST, una función nueva expuesta como RPC) puede seguir fallando con `PGRST204` aunque la migración haya corrido bien — exactamente lo que pasó esta semana, salvo que ahí faltó en PROD.
3. **Verificar con `scripts/verificar-esquema.ts`.** Compara la estructura real de STG contra PROD — columnas, funciones, triggers, políticas RLS, constraints e índices — y sale con exit code 1 si hay cualquier divergencia. Corriendo este paso ANTES de tocar PROD, confirmás que STG quedó como se esperaba y que PROD todavía no tiene el cambio (así se sabe que el paso siguiente es necesario, no redundante).
4. **Recién ahí, aplicar la migración en PROD.**
5. **`NOTIFY pgrst, 'reload schema';` en PROD.** Mismo motivo que el paso 2 — y es el paso que faltó esta semana.
6. **Verificar de nuevo con `scripts/verificar-esquema.ts`.** Debería salir con exit code 0 — STG y PROD estructuralmente iguales otra vez.

```bash
# Antes de tocar PROD
npx tsx scripts/verificar-esquema.ts   # confirma que la migración prendió en STG
                                        # y que PROD todavía no la tiene

# ... aplicar la migración a mano en PROD, luego NOTIFY pgrst, 'reload schema'; ...

npx tsx scripts/verificar-esquema.ts   # exit code 0 esperado
```

`scripts/verificar-esquema.ts` es SOLO LECTURA en los dos ambientes — no aplica nada, solo compara. Ver `scripts/README.md` §5 para el detalle de qué compara y por qué.

---

## ¿Cuándo hace falta `NOTIFY pgrst, 'reload schema';`?

PostgREST construye su vista del esquema (tablas, columnas, relaciones de FK para embedding, y funciones expuestas como RPC) una vez al arrancar, y la mantiene en memoria hasta que algo se lo indica explícitamente. `NOTIFY pgrst, 'reload schema';` es esa señal.

**Hace falta** en cualquier migración que cambie algo que PostgREST expone vía la API REST o RPC:

- `CREATE TABLE` / `DROP TABLE` / `ALTER TABLE ... RENAME`
- `ALTER TABLE ... ADD COLUMN` / `DROP COLUMN` / `ALTER COLUMN ... TYPE` / `RENAME COLUMN` — el caso exacto de esta semana
- `CREATE VIEW` / `DROP VIEW` / `CREATE MATERIALIZED VIEW`
- `CREATE FUNCTION` / `CREATE OR REPLACE FUNCTION` / `DROP FUNCTION` — especialmente las que se llaman vía `/rpc/<nombre>`, pero se recomienda en cualquier función nueva o con firma cambiada, sea o no RPC público hoy
- Agregar o borrar una foreign key — PostgREST la usa para inferir relaciones de embedding (`select=*,tabla_relacionada(*)`)

**NO hace falta** — y agregarlo ahí es ruido, no protección extra:

- `CREATE POLICY` / `ALTER POLICY` / `DROP POLICY` (RLS) — Postgres la aplica en tiempo de query, PostgREST no cachea nada sobre políticas
- `CREATE INDEX` / `DROP INDEX` — invisible para la API, es un detalle de rendimiento interno
- `CREATE TRIGGER` / `DROP TRIGGER` — salvo que dispare la creación de una función que además se expone como RPC (en ese caso, el `NOTIFY` va por la función, no por el trigger)
- Migraciones de datos puras (`INSERT`/`UPDATE`/`DELETE` sin DDL)
- `GRANT`/`REVOKE` — PostgREST valida privilegios en cada request contra el rol vigente, no contra una copia cacheada

**Convención a partir de ahora:** agregar `NOTIFY pgrst, 'reload schema';` al final de toda migración nueva que entre en la primera lista — no en todas, para que la presencia del `NOTIFY` en un archivo siga siendo información (esta migración cambia algo que la API ve), no ruido repetido en cada archivo sin importar qué haga.

**No retroactivo:** las migraciones ya aplicadas (incluidas las de esta misma semana) no se editan para agregarlo — una migración ya aplicada es un hecho histórico, no se toca después. El `NOTIFY` que faltó esta semana se ejecutó a mano, fuera del archivo de migración; esta convención es para lo que se escribe de acá en adelante.

---

## Ejemplo — cómo se ve en una migración nueva

```sql
ALTER TABLE public.mi_tabla
  ADD COLUMN nueva_columna text;

COMMENT ON COLUMN public.mi_tabla.nueva_columna IS '...';

-- PostgREST cachea el esquema; sin este NOTIFY, un INSERT/SELECT que use
-- nueva_columna vía la API REST puede fallar con PGRST204 aunque el ALTER
-- TABLE ya haya corrido. Ver docs/PROCEDIMIENTO-MIGRACIONES.md.
NOTIFY pgrst, 'reload schema';
```
