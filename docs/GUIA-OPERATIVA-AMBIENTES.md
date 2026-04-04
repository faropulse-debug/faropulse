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

1. Crear migración
2. Aplicar en STG
3. Validar funcionalidad completa
4. Aplicar en PROD

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
