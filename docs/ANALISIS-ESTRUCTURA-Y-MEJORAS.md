# Análisis de estructura FARO-APP y oportunidades de mejora

---

## Re-análisis (post mejoras)

### Cambios correctamente realizados

| Área | Estado | Detalle |
|------|--------|---------|
| **Componentes** | Hecho | `components/dashboard/`: SectionLabel, KpiCard, PulsoCard, PeriodoSelector, PEBarChart, Sparkline, InsightBox, CustomTooltip. `components/upload/`: UploadZone, StatusBadge, ProgressBar, ErrorTable, PreviewTable. |
| **Formateadores** | Hecho | `lib/format.ts` con `fmtPeso`, `fmtMillones`, `fmtPct`. |
| **Multi-tenant** | Hecho | `locationId` y `orgName` desde `user?.activeMembership` (con fallback a env) en dashboard owner y en upload. Header muestra `{orgName}` en lugar de texto fijo. |
| **ExcelProcessor** | Hecho | Recibe `locationId` y `orgId` como parámetros (upload page los pasa desde membership); fallback a env solo por defecto. |
| **Seguridad RPCs** | Hecho | En `fn_dashboard_queries.sql`: cada RPC incluye `AND EXISTS (SELECT 1 FROM memberships m WHERE m.user_id = auth.uid() AND m.is_active = true AND (m.location_id = p_location_id OR m.org_id = p_location_id))`. Grants solo a `authenticated`. |
| **Scripts** | Hecho | `lint`: rutas `app lib hooks types components`. `typecheck`: `tsc --noEmit`. |
| **Console.log** | Hecho | Eliminados en `role-select`. Eliminados los `console.log` de `useDashboardData` (queda solo un `console.warn` cuando `locationId` vacío). |
| **Exportar** | Hecho | Botón deshabilitado con `title="Próximamente"`. |

### Pendientes o correcciones menores

| Item | Dónde | Acción sugerida |
|------|--------|------------------|
| **Header del dashboard** | `app/dashboard/owner/page.tsx` | El bloque del header (~60 líneas) sigue inline. Opcional: extraer a `components/dashboard/OwnerDashboardHeader.tsx` para reutilizar en owner y mantener consistencia. |
| **Un console.warn** | `hooks/useDashboardData.ts` línea 57 | `console.warn('[useDashboardData] locationId vacío — usando mocks')`. Eliminarlo o reemplazar por un callback/estado de “sin location” si se quiere exponer en UI. |
| **Semántica RPC** | `fn_dashboard_queries.sql` | La condición `(m.location_id = p_location_id OR m.org_id = p_location_id)` asume que `memberships` tiene `location_id` opcional. Verificar en la BD que la tabla `memberships` tenga la columna `location_id` si se usa por local; si solo existe `org_id`, considerar validar que el `p_location_id` pertenezca a esa org (p. ej. vía tabla `locations`). |

### Oportunidades de mejora que siguen vigentes

- **React Query (TanStack Query)** en `useDashboardData`: caché por `locationId`, reintentos, invalidación y menos estado manual.
- **Tests**: unitarios para `lib/format.ts`, validadores y hooks con Supabase mockado; opcional e2e para login y dashboard.
- **Cliente Supabase en servidor**: si en el futuro se usan Server Components o server actions que lean datos, usar `createServerClient` de `@supabase/ssr` además del cliente browser.
- **Vista Manager**: sigue siendo placeholder; cuando exista contenido, reutilizar componentes de dashboard donde aplique.
- **Estilos**: seguir unificando en Tailwind o CSS modules usando las variables de `globals.css` para reducir inline styles en páginas.

---

## 1. Estructura actual del proyecto

```
faro-app/
├── app/
│   ├── layout.tsx              # Root layout, fuentes, metadata
│   ├── globals.css             # Design system, variables, animaciones
│   ├── page.tsx                # Landing mínima
│   ├── login/page.tsx          # Login con escena visual
│   ├── forgot-password/        # Recuperar contraseña
│   ├── reset-password/         # Reset contraseña
│   ├── role-select/page.tsx    # Elección Owner vs Manager
│   └── dashboard/
│       ├── owner/
│       │   ├── page.tsx        # Dashboard dueño (usa componentes + lib/format)
│       │   └── upload/page.tsx # Carga Excel/CSV (usa UploadZone, locationId/orgId desde membership)
│       └── manager/page.tsx    # Placeholder "En construcción"
├── components/
│   ├── dashboard/              # SectionLabel, KpiCard, PulsoCard, PeriodoSelector,
│   │                           # PEBarChart, Sparkline, InsightBox, CustomTooltip
│   └── upload/                 # UploadZone, StatusBadge, ProgressBar, ErrorTable, PreviewTable
├── hooks/
│   ├── useAuth.ts              # Usuario, membresías, rol, setActiveMembership, signOut
│   └── useDashboardData.ts     # RPCs ventas/financial por locationId (recibido por parámetro)
├── lib/
│   ├── supabase.ts             # Cliente browser Supabase
│   ├── format.ts               # fmtPeso, fmtMillones, fmtPct
│   ├── redirectAfterLogin.ts   # Redirección post-login por membresías
│   ├── processors/
│   │   └── excelProcessor.ts   # locationId/orgId por parámetro; validación, duplicados, insert batch
│   └── validators/
│       └── uploadValidator.ts  # Esquemas por tabla, validación archivo
├── types/
│   └── auth.ts                 # Role, UserProfile, Organization, Membership (location_id opcional), AuthUser
├── supabase/
│   └── fn_dashboard_queries.sql # RPCs con validación auth.uid() + memberships
├── middleware.ts              # Auth + protección rutas por rol (cookie faro_role)
├── next.config.ts
└── package.json               # lint (app lib hooks types components), typecheck (tsc --noEmit)
```

**Stack:** Next.js 16 (App Router), React 19, TypeScript, Supabase (auth + DB + RPC), Tailwind 4, Recharts, xlsx, lucide-react.

---

## 2. Fortalezas

- **Auth y roles:** Flujo claro: login → membresías → role-select → cookie `faro_role` → middleware protege `/dashboard/owner` y `/dashboard/manager`.
- **Separación de responsabilidades:** Validadores (uploadValidator), procesadores (excelProcessor), hooks (useAuth, useDashboardData) bien delimitados.
- **Design system:** Variables CSS en `globals.css` (colores, fuentes), animaciones reutilizables.
- **Dashboard dueño:** Rico en contenido: semáforo KPI, pulso por período, punto de equilibrio, evolutivo 6 meses, insights; integra datos vivos vía RPC y fallback a mocks.
- **Carga de datos:** Validación por esquema, detección de duplicados, preview, modo reemplazar/agregar, batches, registro en `uploads`.

---

## 3. Oportunidades de mejora

### 3.1 Arquitectura y organización

| Área | Situación actual | Mejora sugerida |
|------|------------------|-----------------|
| **Componentes** | Casi todo el UI está inline en páginas (owner ~650 líneas, upload ~430, login ~470). | Crear `components/` (p. ej. `ui/`, `dashboard/`, `auth/`): Header, SectionLabel, KpiCard, PulsoCard, PEBarChart, Sparkline, UploadZone, etc. |
| **Servicios / API** | Acceso a datos repartido en hooks y `excelProcessor` (Supabase directo). | Centralizar en `lib/api/` o `services/` (dashboard, uploads, auth helpers) para reutilizar y testear. |
| **Multi-tenant** | `NEXT_PUBLIC_LOCATION_ID` y `NEXT_PUBLIC_ORG_ID` en env: un solo local/org. | Derivar `location_id` y `org_id` del membership activo (context o hook) para soportar varios locales/orgs. |

### 3.2 Datos y estado

| Área | Situación actual | Mejora sugerida |
|------|------------------|-----------------|
| **locationId en dashboard** | `useDashboardData(LOCATION_ID)` con env. | Pasar `locationId` desde `useAuth().activeMembership` (o contexto de org/location). |
| **Caché y refetch** | Estado manual (useState, useEffect) en `useDashboardData`. | Considerar React Query (TanStack Query) o SWR: caché, reintentos, invalidación, menos boilerplate. |
| **Logs en producción** | `console.log` en `useDashboardData` y `role-select`. | Quitar o usar utilidad de logging condicionada por env. |

### 3.3 Seguridad y configuración

| Área | Situación actual | Mejora sugerida |
|------|------------------|-----------------|
| **Rol en middleware** | Solo cookie `faro_role`; no se revalida contra BD. | Para rutas sensibles, validar rol (o membership) contra Supabase en middleware o en layout. |
| **RPCs** | `SECURITY DEFINER` con `p_location_id`; no comprueban que el usuario tenga acceso a ese location. | Validar en RPC que `auth.uid()` tenga permiso para ese `location_id` (p. ej. vía tabla memberships/locations) o exponer solo vía API que ya filtre por usuario. |
| **Texto fijo en UI** | "Pizzería Popular Ituzaingó" hardcodeado en header del dashboard. | Nombre del local/org desde BD según membership activo. |

### 3.4 UX y consistencia

| Área | Situación actual | Mejora sugerida |
|------|------------------|-----------------|
| **Estilos** | Mezcla de inline styles y Tailwind; difícil mantener. | Unificar: más Tailwind o CSS modules usando variables de `globals.css`; componentes pequeños y reutilizables. |
| **Exportar** | Botón "Exportar" en dashboard dueño sin implementación. | Implementar export (CSV/Excel) del período visible o añadir "Próximamente" y deshabilitar. |
| **Vista Manager** | Página placeholder; igual se puede entrar desde role-select. | Mantener placeholder pero claro, o redirigir a "próximamente" hasta que exista contenido. |

### 3.5 Calidad y mantenimiento

| Área | Situación actual | Mejora sugerida |
|------|------------------|-----------------|
| **Tests** | No hay tests. | Añadir tests unitarios (validators, formatters, hooks con mock de Supabase) y opcionalmente e2e (Playwright) para flujos críticos. |
| **Scripts** | `lint` solo ejecuta `eslint` sin rutas. | Incluir rutas (p. ej. `app lib hooks types`) y añadir `typecheck` (tsc) y `test` si se añaden tests. |
| **Mocks vs datos reales** | En owner: `mockSem`, `peData`, `evolutivo6m` conviven con datos de RPC; no siempre obvio qué es mock. | Documentar o separar claramente (constantes MOCK_* o feature flag) y sustituir mocks por datos reales cuando existan en backend. |
| **Utilidades** | `fmtPeso`, `fmtMillones`, `fmtPct`, etc. en owner. | Extraer a `lib/format.ts` (o `utils/format.ts`) y reutilizar en toda la app. |

### 3.6 Supabase y backend

| Área | Situación actual | Mejora sugerida |
|------|------------------|-----------------|
| **Cliente servidor** | Solo `createBrowserClient` en `lib/supabase.ts`. | Para Server Components o server actions, usar `createServerClient` de `@supabase/ssr` donde haga falta. |
| **Esquemas upload** | `uploadValidator` define columnas; `excelProcessor` mapea a tablas. | Mantener esquemas y mappers alineados (p. ej. misma lista de columnas ventas) para evitar desajustes. |

---

## 4. Resumen priorizado

1. **Alto impacto:** Extraer componentes reutilizables, multi-tenant (location/org desde membership), asegurar RPCs con validación de acceso por usuario.
2. **Medio:** React Query o SWR para datos del dashboard, eliminar console.log, formateadores compartidos, botón Exportar o estado "próximamente".
3. **Bajo / gradual:** Tests, refactor de estilos a Tailwind/CSS modules, validación de rol en middleware contra BD.

---

## 5. Prompt para Claude Code (potenciar la app)

El siguiente bloque está pensado para pegar en Claude Code y orientar mejoras concretas sobre esta base. Podés copiarlo y pegarlo en un chat con Claude Code.

---

### INICIO DEL PROMPT (copiar desde aquí)

**Contexto:** FARO-APP es una aplicación Next.js 16 (App Router) + React 19 + TypeScript para un dashboard gastronómico (FAROPULSE). Usa Supabase (auth, DB, RPC), Tailwind 4, Recharts y xlsx. Hay roles owner/manager, dashboard dueño con KPIs/PE/evolutivo y carga de Excel (ventas, stock, precios, P&L). La estructura está documentada en `docs/ANALISIS-ESTRUCTURA-Y-MEJORAS.md`.

**Objetivo:** Potenciar la app aplicando las mejoras del análisis, en este orden de prioridad:

1. **Componentes reutilizables**  
   - Crear `components/` (por ejemplo `components/ui/`, `components/dashboard/`, `components/auth/`).  
   - Extraer del dashboard owner: Header (con periodo, refetch, “Cargar datos”, Exportar, usuario), SectionLabel, KpiCard, PulsoCard, PeriodoSelector, PEBarChart, Sparkline, InsightBox, CustomTooltip y formateadores (fmtPeso, fmtMillones, fmtPct) a `lib/format.ts`.  
   - Extraer de la página de upload: UploadZone, StatusBadge, ProgressBar, ErrorTable, PreviewTable (y si aplica, iconos compartidos) para poder reutilizarlos.  
   - Mantener el mismo look & feel (design system en `app/globals.css`) y que las páginas actuales usen estos componentes sin cambiar comportamiento visible.

2. **Multi-tenant y datos**  
   - Dejar de usar `NEXT_PUBLIC_LOCATION_ID` / `NEXT_PUBLIC_ORG_ID` como única fuente.  
   - Obtener `location_id` (y si aplica `org_id`) del membership activo en useAuth (o un contexto `OrganizationContext` que lea del mismo hook).  
   - Pasar ese `location_id` a `useDashboardData` y al excelProcessor (y donde se use org/location).  
   - Mostrar en el header del dashboard el nombre del local u organización desde los datos del membership/organization, no texto fijo.

3. **Seguridad en RPCs**  
   - En las funciones de `supabase/fn_dashboard_queries.sql`: asegurar que el usuario autenticado tenga permiso sobre el `p_location_id` (por ejemplo validando contra una tabla de memberships/locations con `auth.uid()`). Si no tiene permiso, devolver vacío o error.  
   - Documentar en un comentario en el SQL que las RPCs asumen que el caller ya está autorizado o que la validación se hace dentro de la función.

4. **Calidad de código**  
   - Quitar `console.log` de `useDashboardData` y de `app/role-select/page.tsx`.  
   - Añadir script `typecheck` en `package.json` que ejecute `tsc --noEmit` y, si querés, que `lint` incluya rutas (por ejemplo `app lib hooks types components`).

5. **Opcional (si da tiempo):**  
   - Implementar el botón “Exportar” del dashboard owner (por ejemplo exportar a CSV/Excel el período actual o los datos visibles) o dejarlo deshabilitado con tooltip “Próximamente”.  
   - Introducir React Query (TanStack Query) en `useDashboardData`: caché por `location_id`, refetch automático o manual, estados loading/error unificados.

**Restricciones:**  
- No cambiar el flujo de auth ni la lógica de roles (cookie + middleware).  
- Mantener compatibilidad con el contenido actual de las páginas (login, role-select, dashboard owner, upload).  
- No eliminar mocks del dashboard hasta que existan reemplazos reales en backend; solo organizar y comentar qué es mock.

Por favor, implementá los puntos 1 a 4 de forma incremental: primero componentes y `lib/format.ts`, luego multi-tenant y datos, después seguridad en RPCs y por último limpieza de logs y scripts. Indicá al final qué archivos tocaste y qué queda pendiente (por ejemplo punto 5).

---

### FIN DEL PROMPT
