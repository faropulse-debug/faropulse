# Guía Operativa de Ambientes (DEV / STG / PROD)

Objetivo: operar FARO-APP con separación real de ambientes para trabajar rápido, seguro y sin contaminar datos de clientes.

---

## 1) Arquitectura objetivo (simple y profesional)

- **DEV (local):** `localhost:3000` + Supabase DEV.
- **STG (staging):** Deploy de `develop` en Vercel (Preview con alias estable) + Supabase STG.
- **PROD:** Deploy de `main` en Vercel + Supabase PROD.

Recomendación concreta:
- 1 proyecto Vercel con `main` como Production Branch.
- 2 proyectos Supabase separados: `faro-staging` y `faro-prod`.

---

## 2) Variables por ambiente

Variables mínimas que debe tener FARO-APP:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (solo server)
- `SUPABASE_ACCESS_TOKEN` (solo para CLI/migrations)
- `NEXT_PUBLIC_ORG_ID`
- `NEXT_PUBLIC_LOCATION_ID`
- `NEXT_PUBLIC_APP_ENV` (`development` | `staging` | `production`)

### Matriz recomendada

- **DEV local:** credenciales de Supabase DEV, `NEXT_PUBLIC_APP_ENV=development`
- **STG (Vercel Preview/develop):** credenciales de Supabase STG, `NEXT_PUBLIC_APP_ENV=staging`
- **PROD:** credenciales de Supabase PROD, `NEXT_PUBLIC_APP_ENV=production`

---

## 3) Configuración en Vercel

### Paso A: Branches

- `main` = producción
- `develop` = staging
- features = trabajo diario

### Paso B: Git settings

En Vercel:
- `Production Branch` = `main`

### Paso C: Environment Variables (scopes)

Cargar variables con scopes:
- **Production:** valores PROD
- **Preview:** valores STG
- **Development:** opcional para `vercel dev`

Tip importante:
- Configurar alias de branch para `develop` y tener URL estable de staging.

---

## 4) Configuración en Supabase

### Proyecto STG

- Crear proyecto Supabase de staging.
- Aplicar mismas migraciones que PROD.
- Cargar datos de prueba (`seed.sql` recomendado).

### Proyecto PROD

- Solo datos reales.
- Cambios llegan después de validarse en STG.

### Flujo de migraciones

Procedimiento completo (con verificación automatizada de esquema y el paso
de NOTIFY a PostgREST que faltó la semana del 2026-09-01 y rompió uploads
con PGRST204): ver `docs/PROCEDIMIENTO-MIGRACIONES.md`. Resumen:

1. Crear migración
2. Aplicar en STG → `NOTIFY pgrst, 'reload schema';` si corresponde
3. Verificar con `scripts/verificar-esquema.ts`
4. Aplicar en PROD → `NOTIFY pgrst, 'reload schema';` si corresponde
5. Verificar de nuevo

---

## 5) Flujo operativo diario (equipo)

1. Desarrollar en branch feature (DEV local)
2. Push + PR hacia `develop`
3. Vercel despliega Preview (STG)
4. QA funcional en STG (login, roles, dashboard, upload, seguridad)
5. Merge `develop` -> `main`
6. Deploy automático a PROD

Regla clave:
- Nada va a `main` sin pasar por STG.

---

## 5.1) Matriz de usuarios de prueba en STG (QA por rol)

Para verificar role-gating (403 de API, guards de página, RLS cross-tenant) sin
tocar PROD ni usar cuentas reales, STG (`egjxyskqhnmuqwkrbshu`, location
`bbbbbbbb-0000-0000-0000-000000000001` / org `aaaaaaaa-0000-0000-0000-000000000001`)
tiene una cuenta activa por cada rol del sistema:

| Rol         | Email                          |
|-------------|---------------------------------|
| owner       | `qa-owner@faropulse.test`       |
| manager     | `qa-manager@faropulse.test`     |
| encargado   | `qa-encargado@faropulse.test`   |
| staff       | `qa-staff@faropulse.test`       |

Patrón: `qa-<rol>@faropulse.test` — dominio `.test` (reservado por RFC 2606,
nunca resuelve) para que sea imposible confundirlas con cuentas reales o
mandarles mail por error.

**Contraseñas:** en `.env.stg-test-users` (raíz del repo, gitignorado por la
regla `.env*` de `.gitignore` — nunca se commitea). Si no lo tenés localmente,
pedíselo a quien corrió el alta o regenerá las cuentas (ver abajo).

**Cómo se crearon:** cada cuenta se dio de alta vía Supabase Admin API
(`email_confirm: true`) y se le asignó rol/org/location con
`provision_membership()` (`supabase/migrations/20260728000002_add_provision_membership_function.sql`,
ver también `supabase/runbook-alta-usuario.sql`). Para recrear la matriz o
agregar un rol nuevo, seguir el mismo patrón: alta en Auth + una llamada a
`provision_membership(user_id, org_id, location_id, role, full_name)`.

---

## 5.2) Segundo tenant en STG (QA Tenant B) — para tests cross-tenant

Hasta 2026-07-29 STG tenía una sola organización — imposible probar
aislamiento cross-tenant con datos reales (solo había cobertura con Supabase
mockeado y `audit-rls.ts`, que confirma que las policies existen por nombre
pero nunca ejecuta una query real como usuario de otra org). Se creó un
segundo tenant sintético para cerrar ese gap:

| Campo | Valor |
|---|---|
| Organización | "QA Tenant B" (`slug: qa-tenant-b`) — `org_id` en `.env.stg-test-users` (`QA_TENANT_B_ORG_ID`) |
| Location | "QA Tenant B - Sucursal Sintetica" — `location_id` en `.env.stg-test-users` (`QA_TENANT_B_LOCATION_ID`) |
| Usuario owner | `qa-b-owner@faropulse.test` — password en `.env.stg-test-users` (`QA_B_OWNER_PASSWORD`), mismo archivo que la matriz de roles de arriba |
| Datos sintéticos | 3 filas en `sales_documents` (location de Tenant B), `external_id` `QA-TENANT-B-DOC-001/002/003`, totales **555555.55 / 666666.66 / 777777.77** — deliberadamente reconocibles: si alguno de estos números aparece fuera de una sesión de Tenant B, el aislamiento está roto |

**No son datos copiados de la org existente ni de PROD** — org, location y
ventas son 100% fabricados para este propósito.

### Verificación de aislamiento (2026-07-29, con sesiones autenticadas reales)

Tres vectores probados, ninguno filtró datos:

1. **RPCs del dashboard con `location_id` de la otra org** (`get_ventas_mensuales`
   vía REST real, con el `access_token` de cada usuario): A pidiendo la
   location de B → `[]`. B pidiendo la location de A → `[]`. Control: cada
   uno pidiendo su propia location trae sus datos reales (B trae exactamente
   `ventas: 1999999.98` = la suma de los 3 totales sintéticos).
2. **SELECT directo sobre `sales_documents` cruzando orgs** (REST con RLS,
   sesión real de cada usuario): filtro explícito por la location de la otra
   org → `[]` en ambos sentidos. Sin filtro de location (todo lo que ve el
   usuario): A ve sus ~1000 filas propias y **cero** con los totales
   distintivos de B; B ve exactamente sus 3 filas sintéticas y nada de A.
3. **`requireMembership()` (el gate real de las rutas de API) con el
   `location_id` de la otra org** — el caso más peligroso, probado invocando
   la función tal cual la importan las rutas (no una reimplementación): A con
   la location de B → `403 Forbidden: no active membership for this
   location`. B con la de A → mismo 403. Control: cada uno con su propia
   location pasa y devuelve su `userId`.

**Resultado: sin fugas en ninguno de los 3 vectores.** RLS
(`user_has_membership`) y `requireMembership()` (que no depende de RLS —
consulta `memberships` directo con service role) coinciden en bloquear el
cruce. No se encontró el escenario P0 que motivó esta tarea.

---

## 5.3) Nota de infraestructura — anon key legacy

El anon key en `.env.staging` (local) es un
*legacy key* y Supabase lo deshabilitó — cualquier llamada a
`/auth/v1/token` (login) con ese valor devuelve 401 "Legacy API keys are
disabled", aunque el resto de las queries (Management API, `SUPABASE_ACCESS_TOKEN`)
sigan funcionando igual. El anon key vigente es el que Vercel tiene cargado en
Preview (`sb_publishable_...`, formato nuevo) — para probar login real usar
ese, no el de `.env.staging` sin antes actualizarlo.

---

## 6) Checklist de salida a producción

### Técnico

- [ ] `npm run typecheck` sin errores
- [ ] `npm run lint` sin errores
- [ ] Migraciones aplicadas y validadas en STG
- [ ] Variables de Vercel correctas por scope
- [ ] STG apunta a Supabase STG
- [ ] PROD apunta a Supabase PROD

### Funcional

- [ ] Login/logout ok
- [ ] Role-select y redirecciones ok
- [ ] Dashboard owner carga datos reales correctamente
- [ ] Upload (preview, duplicados, insert, replace) probado
- [ ] RLS valida aislamiento por tenant/location

### Operativo

- [ ] Backup/snapshot de PROD disponible
- [ ] Plan de rollback definido (revert commit + rollback de migración si aplica)

---

## 7) Cambios mínimos de código recomendados

Para cerrar la separación de ambientes de forma robusta:

1. **Agregar `NEXT_PUBLIC_APP_ENV` a `.env.example`**
2. **Crear `lib/env.ts`** para validar variables obligatorias
3. **Crear `lib/logger.ts`** con niveles y silenciamiento de debug en producción
4. **(Opcional) `supabase/seed.sql`** para staging reproducible

---

## 8) Ejemplo de `lib/env.ts` (referencia)

```ts
const REQUIRED = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'NEXT_PUBLIC_APP_ENV',
] as const

for (const key of REQUIRED) {
  if (!process.env[key]) {
    throw new Error(`Missing required env var: ${key}`)
  }
}

export const APP_ENV = process.env.NEXT_PUBLIC_APP_ENV as
  | 'development'
  | 'staging'
  | 'production'

export const IS_PROD = APP_ENV === 'production'
```

---

## 9) Antipatrones a evitar

- Usar el mismo Supabase para STG y PROD.
- Usar variables de PROD en scope Preview.
- Deploy directo a `main` sin pasar por `develop`.
- Probar uploads destructivos sobre datos reales.

---

## 10) Resultado esperado

Si seguís esta guía, FARO-APP queda con:
- aislamiento de datos,
- releases controlados,
- menor riesgo operativo,
- base sólida para clientes y crecimiento.

---

## 11) Aislamiento de Agentes y Desarrolladores (Git Worktrees)

Para evitar colisiones entre agentes concurrentes o tareas simultáneas sobre el directorio compartido, cada agente o tarea debe operar en su propio **Git Worktree** aislado.

### Comando al arrancar cualquier agente o tarea:

```bash
# En Linux / macOS / Bash:
./scripts/setup-worktree.sh feature/mi-tarea origin/develop

# En Windows / PowerShell:
.\scripts\setup-worktree.ps1 -Branch feature/mi-tarea -BaseRef origin/develop
```

El script:
1. Crea un directorio de trabajo aislado en `../faro-app-worktrees/<nombre-de-rama>`.
2. Asocia y checkoutea la rama de forma limpia contra `origin/develop`.
3. Copia automáticamente los archivos `.env` necesarios (`.env.staging`, `.env.stg-test-users`, `.env.local`).
4. Imprime la ruta para comenzar a trabajar de inmediato con `cd <path>`.

Antes de cada commit, verificar siempre la rama activa con:
```bash
git branch --show-current
```

