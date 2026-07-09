# Reporte de QA - Proyecto FARO

## Entornos
- **STG URL:** https://faropulse-git-develop-faropulse-debugs-projects.vercel.app
- **Nota de Acceso STG:** STG se encuentra bloqueado por la protección de preview de Vercel (Vercel SSO / HTTP 302 hacia `/sso-api`). Debido a esto, la suite de tests automatizados (E2E) ha sido configurada para ejecutarse apuntando a `http://localhost:3000` levantando el servidor local a través de `npm run dev`.

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
