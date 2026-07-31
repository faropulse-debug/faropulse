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

### 3. HALLAZGO DE PROCESO — El repositorio no es fuente de verdad del schema
> [!WARNING]
> **Punto ciego estructural en el Veredicto de QA**
> El veredicto original de "APTO PARA MERGE" evaluó con éxito la coherencia del código fuente, pero contenía una falla estructural: **asumió ciegamente que el esquema de la base de datos de producción reflejaba las migraciones del repositorio**. Como agente de QA, mi capacidad de certificación estuvo limitada al repositorio, desconociendo el estado real de la infraestructura destino.

**El Problema:**
Existen mutaciones en la base de datos aplicadas directamente a través del SQL Editor en STG que nunca fueron consolidadas en archivos de migración (`.sql`) dentro del repo. 

**Evidencia Encontrada:**
1. **Migraciones Fantasma:**
   - `ALTER TABLE memberships ADD COLUMN location_id` (y su posterior backfill) se corrió a mano.
   - `CREATE TABLE location_pos_config` se creó a mano.
2. **Divergencia de Constraints:**
   - La restricción `memberships_role_check` en PROD validaba roles viejos (`owner`, `manager`, `viewer`). En STG ese constraint aparentemente ni existía de la misma forma, por lo que nunca hubo colisión en pruebas. Una migración para el nuevo check fallaría o dejaría el schema inconsistente en PROD.

**El Riesgo Crítico:**
Si este código se hubiera desplegado a PROD tal como estaba, la función `user_has_membership()` hubiese filtrado por la columna `location_id` (inexistente en PROD). Esto habría devuelto `0 filas` para todos los usuarios, rompiendo por completo las políticas de RLS y dejando al cliente piloto sin ver ningún dato en su dashboard. Todo deploy futuro es una ruleta rusa si se asume un schema irreal.

> [!TIP]
> **Sugerencia de Fix de Proceso (En diseño):**
> Implementar un script de verificación pre-deploy que compare el schema REAL del ambiente (columnas, constraints, tablas) contra el esperado del repo.

### 4. Veredicto Final
> [!CAUTION]
> 🔴 **NO MERGEAR**
> Hasta que los esquemas de BD no estén sincronizados y versionados, el código fuente es inutilizable en producción.

---

## Notas de Testing E2E
Se crearon en `tests/e2e/roles.spec.ts` los siguientes checks (apuntando a localhost por las limitaciones de Vercel ya documentadas):
- Comprobar que `/dashboard/owner/v2` redirige a `/login` ante un estado de no-sesión.
- Comprobar que `/role-select` redirige a `/login` ante un estado de no-sesión.

> [!WARNING]
> **BLOQUEANTE: Impedimentos de Testing E2E**
> No se pudo probar el login exitoso seguido de selección de rol hacia dashboard porque no disponemos de credenciales de prueba válidas. Se requiere urgentemente:
> - Credenciales de tests (usuarios sembrados en DB local o STG) cubriendo cada uno de los 5 roles, o bien, un script de seed de DB que prepare este entorno. Sin esto, no es posible automatizar el flujo feliz completo (sucursal → módulos).
