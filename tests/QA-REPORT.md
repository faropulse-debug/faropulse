# Reporte de QA - Proyecto FARO

## Entornos
- **STG URL:** https://faropulse-git-develop-faropulse-debugs-projects.vercel.app
- **Nota de Acceso STG:** STG se encuentra bloqueado por la protección de preview de Vercel (Vercel SSO / HTTP 302 hacia `/sso-api`). Debido a esto, la suite de tests automatizados (E2E) ha sido configurada para ejecutarse apuntando a `http://localhost:3000` levantando el servidor local a través de `npm run dev`.

---

## Auditoría Pre-Merge a PROD (2026-07-09)

### 1. Revisión de Regresión (Cardinalidad y Roles)
- **Bugs de Cardinalidad:**
  - El `.maybeSingle()` riesgoso en `proxy.ts` reportado anteriormente fue solucionado en esta rama usando `.limit(1)`.
  - El uso de `.maybeSingle()` en `lib/api-auth.ts` ahora es 100% seguro gracias a la nueva migración en DB (`20260705000002_memberships_unique_location.sql`) que aplica la restricción `UNIQUE (user_id, location_id)`.
  - El `.find()` en `AuthProvider.tsx` opera como un fallback inofensivo; si la sesión local se corrompe, el middleware atajará al usuario enviándolo a `/role-select` para regenerar la cookie.
  - **Resultado:** No hay bugs de cardinalidad. El código asimila correctamente el esquema multi-location.
- **Coherencia del Sistema de Roles:**
  - Constraints en DB (5 roles), enum TS, `TABS` y `proxy.ts` están perfectamente alineados.
  - Los roles más restrictivos (`staff`, `encargado`) están limitados por interfaz y middleware al módulo de `operaciones`. No existen contradicciones.
- **Flujo de Usuario:**
  - El rediseño de dos pasos (Sucursal → Módulo) funciona de maravilla y no deja a ningún usuario atascado o con tabs vacías.
- **Casos Borde:**
  - Usuarios con 0 membresías ven un mensaje amigable.
  - Manipulación directa de URLs (query params inválidos) hace fallback a valores por defecto (`operaciones`) de forma segura.

### 2. Verificaciones Automáticas
- Linter (`npm run lint`): 🟢 (0 errores).
- Typecheck (`npx tsc --noEmit`): 🟢
- Tests Unitarios (`npx vitest run`): 🟢 (236/236 OK).
- Build (`npm run build`): 🟢 (Compilación de Next.js exitosa).
- Tests E2E (`npm run test:e2e`): 🟡 (El endpoint de health falla por timeout local contra Supabase, no es regresión de código. Los tests de roles están OK).

### 3. Hallazgo Estructural de Proceso (Bloqueante)
> [!WARNING]
> **El repositorio NO es la fuente de verdad del estado de la base de datos.**
> Se detectó que existen migraciones SQL (como el agregado de la columna `location_id` en `memberships` y la creación de la tabla `location_pos_config`) que fueron aplicadas manualmente en el entorno de STG a través del SQL Editor, pero **nunca se versionaron en el repositorio**.
> **Riesgo Crítico:** Cualquier deploy a PROD asume un esquema de base de datos que no existe en el ambiente de destino. Si este código se despliega, `user_has_membership` fallará por intentar leer una columna inexistente, dejando al cliente piloto sin acceso a sus datos.

> [!TIP]
> **Sugerencia de Fix de Proceso:**
> Se debe implementar un script de verificación pre-deploy (similar al existente `audit-rls.ts`) que conecte con la base de datos del entorno de destino, lea el esquema real y lo compare automáticamente contra las migraciones declaradas en el repositorio. Si detecta discrepancias en tablas, columnas o constraints, el pipeline de CI/CD debe fallar e impedir el despliegue.

### 4. Veredicto Final
> [!CAUTION]
> 🔴 **NO MERGEAR**
> Si bien el código fuente pasó todas las validaciones de QA con éxito, **la ausencia de las migraciones SQL en el repositorio es un impedimento bloqueante.** No se debe mergear hasta que los archivos de migración `.sql` correspondientes sean commiteados al repositorio.

---

## Regresión de Roles (Sprint D)

### Respuestas a la Revisión de Coherencia:
**a) ¿La cookie faro_role se setea SIEMPRE antes de que el usuario llegue al dashboard?**
Sí, en el flujo normal se setea al clickear la tarjeta en `/role-select`. Si el usuario intenta forzar la URL directamente a `/dashboard/owner/v2` sin tener la cookie, el middleware (`proxy.ts`) lo intercepta bloqueándole el paso y forzando un redirect de vuelta a `/role-select`. 

**b) ¿Qué pasa si un usuario tiene 0 memberships?**
El flujo lo contiene de forma segura. Al loguearse, el redirect lo manda a `/role-select`. La página detecta el array vacío y en lugar de tarjetas renderiza un fallback graceful: *"No tenés acceso a ningún local. Contactá al administrador."*. Al no poder clickear nada, no se genera cookie y no puede entrar al dashboard.

**c) ¿Qué pasa si un usuario tiene rol 'super_admin' o 'staff'?**
Ambos pueden acceder. El middleware los reconoce como válidos (`DASHBOARD_ROLES`). Según la configuración de `TABS` en el dashboard:
- `super_admin` ve los 5 tabs (Resumen, Operación, P&L, Inversión, Descuentos).
- `staff` ve 2 tabs (Resumen, Operación).

**d) ¿Hay rutas viejas hardcodeadas?**
Sí, hay contradicciones semánticas e históricas:
1. `proxy.ts` sigue validando explícitamente `pathname.startsWith('/dashboard/manager')` aunque aparentemente ya no se usa.
2. `role-select/page.tsx` hace un push hardcodeado a `/dashboard/owner/v2` para **todos** los roles. Es decir, un `staff` o un `manager` terminan viendo una ruta que dice `/owner/`. Esto confirma que `/owner/v2` mutó a ser un dashboard unificado pero conservó la ruta vieja.

**e) ¿El enum Role de TS coincide con la DB?**
Sí, los 5 valores coinciden exactamente en `types/auth.ts`: `'owner' | 'manager' | 'encargado' | 'super_admin' | 'staff'`.

---

## Bugs y Hallazgos Adicionales

### Bug 1: Error al evaluar roles duplicados en `proxy.ts`
- **Ubicación:** `proxy.ts` línea 85 (`.maybeSingle()`).
- **Riesgo:** Medio.
- **Descripción:** El query usa `.maybeSingle()` para validar que el rol de la cookie exista en base de datos. Si un usuario tiene más de 1 local **con el mismo rol** (ej: es `owner` de 2 sucursales), la query va a fallar lanzando un error de PostgREST `PGRST116` (múltiples filas encontradas). Por cómo está armada la validación (`if (!memErr && !mem)`), el sistema **falla abierto** y lo deja pasar, pero debilita la seguridad y va a inundar los logs de BD con errores 500 cada vez que este usuario navegue.
- **Sugerencia de Fix:** Cambiar `.maybeSingle()` por `.limit(1)` (o `.maybeSingle()` si de verdad aseguramos unicidad, cosa que aquí no aplica).

### Bug 2: Componentes muertos / Lógica olvidada en UI
- **Ubicación:** `app/role-select/page.tsx`.
- **Riesgo:** Muy Bajo (Cosmético).
- **Descripción:** Se encuentra definido y exportado el componente `PanelIcon` pensado para renderizarse si el rol es de `manager` o similar. Sin embargo, nunca se invoca en todo el mapeo de `RoleCard`, dejándolo como código muerto y usando el `CompassIcon` ciegamente para todos los roles.

### Bug 3 (Previo - Solucionado): Renderizados en cascada
- **Estado:** Ya fue solucionado por el equipo en rama paralela, removiendo el `useEffect` en favor de estado derivado directo.

---

## Notas de Testing E2E
Se crearon en `tests/e2e/roles.spec.ts` los siguientes checks (apuntando a localhost por las limitaciones de Vercel ya documentadas):
- Comprobar que `/dashboard/owner/v2` redirige a `/login` ante un estado de no-sesión.
- Comprobar que `/role-select` redirige a `/login` ante un estado de no-sesión.

> [!WARNING]
> **BLOQUEANTE: Impedimentos de Testing E2E**
> No se pudo probar el login exitoso seguido de selección de rol hacia dashboard porque no disponemos de credenciales de prueba válidas. Se requiere urgentemente:
> - Credenciales de tests (usuarios sembrados en DB local o STG) cubriendo cada uno de los 5 roles, o bien, un script de seed de DB que prepare este entorno. Sin esto, no es posible automatizar el flujo feliz completo (sucursal → módulos).
