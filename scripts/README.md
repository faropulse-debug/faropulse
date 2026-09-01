# FARO Security & Schema Audit Arsenal

Este directorio contiene las herramientas de auditoría (Capa 1 y Capa 2) para asegurar que el repositorio de FARO es la única fuente de verdad, y que las políticas de seguridad son robustas.

## 1. Audit RLS y Security Posture (Capa 1)

Verifica que las políticas RLS sean seguras y no tengan brechas (como anon select sin filtros).

```bash
# STG
npx cross-env PROJECT_REF=egjxyskqhnmuqwkrbshu SUPABASE_ACCESS_TOKEN=<TU_PAT> npx tsx scripts/audit-security-posture.ts

# PROD
npx cross-env PROJECT_REF=lahnngwyfbejgesulafr SUPABASE_ACCESS_TOKEN=<TU_PAT> npx tsx scripts/audit-security-posture.ts
```

## 2. Audit Schema (Capa 2)

Compara el esquema real en STG/PROD contra el esquema esperado (Shadow DB) generado a partir de las migraciones `.sql` versionadas en el repositorio. Detecta columnas fantasma, funciones manipuladas, o tablas creadas a mano.

### Prerrequisito: Levantar Shadow DB Local
Para tener un punto de comparación limpio ("Expected"), necesitamos correr las migraciones del repo en un postgres descartable (la "Shadow DB").
Si tenés Supabase CLI podés iniciar una base local y sus migraciones se aplicarán solas:
```bash
npx supabase start
```
*Tu SHADOW_DB_URL será entonces: `postgresql://postgres:postgres@127.0.0.1:54322/postgres`*

### Caso de Uso 1: Validación en CI (Pull Requests)
Se corre contra **STG** al abrir un PR para asegurar que los desarrolladores versionaron todos los cambios de base de datos antes de unificar.
Si la rama trae migraciones nuevas (`MISSING` en STG), se muestran como `INFO` (no rompen el build) porque se aplicarán después. Pero si detecta tablas manuales (`DRIFT`), explota.

```bash
npx cross-env PROJECT_REF=egjxyskqhnmuqwkrbshu \
              SUPABASE_ACCESS_TOKEN=<TU_PAT> \
              SHADOW_DB_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
              npx tsx scripts/audit-schema.ts --mode ci
```

### Caso de Uso 2: Verificación Pre-Deploy (PROD)
Se corre manualmente contra **PROD** *antes* de lanzar una actualización para saber qué cosas van a cambiar, o para auditar si alguien metió mano en producción durante la noche.

```bash
npx cross-env PROJECT_REF=lahnngwyfbejgesulafr \
              SUPABASE_ACCESS_TOKEN=<TU_PAT> \
              SHADOW_DB_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
              npx tsx scripts/audit-schema.ts --mode pre-deploy
```

### Caso de Uso 3: Verificación Post-Apply
Modo por defecto. Se corre después del deploy. En este caso, si a la base de datos real le falta alguna tabla que sí está en el repo (`MISSING`), es un `ERROR` gravísimo (la migración falló y los esquemas quedaron desincronizados).

```bash
npx cross-env PROJECT_REF=lahnngwyfbejgesulafr \
              SUPABASE_ACCESS_TOKEN=<TU_PAT> \
              SHADOW_DB_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
              npx tsx scripts/audit-schema.ts --mode post-apply
```

> **Salvaguarda de Frescura:** El script `audit-schema.ts` validará que la base de datos shadow (indicada en `SHADOW_DB_URL`) tenga *efectivamente* aplicados todos los archivos `.sql` presentes en `supabase/migrations/`. Si usás una Shadow vieja, abortará inmediatamente para prevenir falsos positivos.

## 3. Invariante STG vs PROD (Capa 6)

Compara STG contra PROD: conteo de filas y rango de fechas por tabla (informativo), y dos criterios sobre documentos con la misma clave de negocio (`external_id` + `fecha_caja`) — ambos determinan el exit code:

- **Presencia**: items en un ambiente y no en el otro (el patrón del incidente original: 3 cortesías con items faltantes en STG, detectadas a mano el 2026-08-30).
- **Cantidad**: items en los dos ambientes, pero en cantidad distinta (punto ciego encontrado 2026-09 — la primera versión solo miraba presencia/ausencia y no vio 3 filas de diferencia real entre 89.723 en STG y 89.726 en PROD, todas dentro de documentos que sí tenían items en ambos lados).

El output también suma el delta total de filas de `sales_items` entre ambientes, no solo el conteo de documentos divergentes. SOLO LECTURA en los dos ambientes, siempre.

```bash
npx tsx scripts/invariante-stg-prod.ts
```

Config vía `.env.staging` (STG) y `.env.local.prod` (PROD), mismo patrón que `estado-real.ts`. Si a PROD le faltan credenciales, corre el chequeo parcial (solo STG) y sale con exit code 0 — no declara divergencia sin haber podido comparar contra el otro ambiente.


## 4. Diff de item_hash STG vs PROD (Capa 7)

Complementa a Capa 6, no la reemplaza. Capa 6 compara *conteos* de filas por documento sobre el dataset entero — barato, corre rápido, sin parámetros. Pero un documento con el mismo conteo de items en los dos ambientes puede tener contenido distinto (un `item_hash` cambiado, o un huérfano que reemplazó a otro sin borrarlo) — el conteo no lo ve. Esta capa sí: compara el SET completo de `item_hash` por documento, no solo cuántos hay.

Es deliberadamente más cara — trae cada fila de `sales_items` del rango, no un `COUNT`/`GROUP BY` — por eso pide un rango de fechas en vez de correr sobre todo el histórico como Capa 6. Usala como segundo paso dirigido cuando Capa 6 da 0 divergencias pero hay motivo para sospechar de un rango puntual: después de una recarga manual de Excel, o cuando el `newCount` del preview de upload no coincide con lo que Capa 6 esperaría.

Caso real que motivó el script: la recarga de junio 2025 en STG dejó `X 00001-00001072` con un item duplicado — mismo conteo en los dos ambientes *antes* de la recarga, pero un `item_hash` viejo (de un seed de mayo 2026) que el Excel de junio 2025 nunca volvió a producir, así que `commit_upload` insertó la fila correcta sin borrar la vieja.

```bash
npx tsx scripts/diff-item-hashes.ts <FROM> <TO>
npx tsx scripts/diff-item-hashes.ts 2025-06-01 2025-06-30
```

Config vía `.env.staging` (STG) y `.env.local.prod` (PROD), mismo patrón que `invariante-stg-prod.ts`. A diferencia de Capa 6, **no tiene modo parcial**: sin los dos ambientes no hay nada que comparar, así que sale con exit code 1 si falta cualquiera de los dos.

## 5. Verificar esquema STG vs PROD

A diferencia de Capa 6 y Capa 7 (que comparan *datos*), este compara la *estructura*: columnas, funciones, triggers, políticas RLS, constraints e índices. Nace de un incidente real de la semana del 2026-09-01 — una migración se aplicó a mano en PROD antes que en STG (al revés de la doctrina, ver `docs/PROCEDIMIENTO-MIGRACIONES.md`), y nadie lo detectó hasta que un upload rompió con `PGRST204` (columna no encontrada en el cache de esquema de PostgREST). No había ninguna herramienta que comparara la estructura entre ambientes.

Reutiliza `fetchSchemaState()` y `evaluateSchemaDiff()` de `scripts/lib/supabase-api.ts` / `schema-engine.ts` — la misma maquinaria que ya usa `audit-schema.ts` para comparar un ambiente contra el esquema esperado del repo (Shadow DB). Acá los dos lados son ambientes reales: STG se pasa como `expected` (la doctrina dice que se migra primero, así que es "lo que PROD debería tener") y PROD como `actual`. Con esa asignación, algo en PROD que STG no tiene sale como `DRIFT` ("PROD se adelantó") y algo en STG que PROD no tiene sale como `MISSING` ("falta promover a PROD") — el script traduce esas dos etiquetas a `[SOLO EN PROD]` / `[SOLO EN STG]` en el output.

Triggers y políticas RLS no están cubiertos por `schema-engine.ts` — se agregan en el script mismo como chequeo de existencia, sin tocar la librería compartida (para no arriesgar `audit-schema.ts`).

```bash
npx tsx scripts/verificar-esquema.ts
```

Config vía `.env.staging` (STG) y `.env.local.prod` (PROD), mismo patrón que `invariante-stg-prod.ts`. Sin modo parcial — sin los dos ambientes no hay esquema que comparar. SOLO LECTURA en los dos ambientes, siempre. Exit code 1 si hay cualquier divergencia.