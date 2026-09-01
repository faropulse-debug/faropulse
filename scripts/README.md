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

Compara STG contra PROD: conteo de filas y rango de fechas por tabla (informativo), y documentos con la misma clave de negocio (`external_id` + `fecha_caja`) que tienen items en un ambiente y no en el otro (esto sí determina el exit code — es el patrón exacto del incidente que motivó el script: 3 cortesías con items faltantes en STG, detectadas a mano el 2026-08-30). SOLO LECTURA en los dos ambientes, siempre.

```bash
npx tsx scripts/invariante-stg-prod.ts
```

Config vía `.env.staging` (STG) y `.env.local.prod` (PROD), mismo patrón que `estado-real.ts`. Si a PROD le faltan credenciales, corre el chequeo parcial (solo STG) y sale con exit code 0 — no declara divergencia sin haber podido comparar contra el otro ambiente.
