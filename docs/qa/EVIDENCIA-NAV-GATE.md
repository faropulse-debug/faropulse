# EVIDENCIA DE QA — VERIFICACIÓN INDEPENDIENTE DE NAV GATE (H1)

**Fecha de ejecución:** 2026-08-14  
**Entorno de prueba:** Staging (`project-ref: egjxyskqhnmuqwkrbshu`)  
**SHA de `origin/develop` verificado:** `b34a65c`  
**Rama de trabajo:** `feature/qa-nav-gate`  
**Guardrail de ambiente:** `scripts/assert-stg.ts` (Verificado activo)

---

## 1. Verificación de Commits Previos (Paso 0)

| Commit | Descripción | Presente en `origin/develop` | Presente en `origin/main` |
|---|---|---|---|
| `eba0bf8` | `fix(authz): gate /dashboard/pnl and /dashboard/reconcile behind WRITE_ROLES` | **SÍ** | NO |
| `60becea` | `fix(authz): gate /dashboard/upload behind WRITE_ROLES` | **SÍ** | NO |

---

## 2. Matriz Esperada (Construida independientemente por QA)

Esta matriz se redactó a mano en base a las reglas de negocio y los requerimientos de la historia H1, sin importar definiciones del código fuente:

| Ruta | Justificación de Negocio | Roles Permitidos (`allow`) | Roles Denegados (`deny` → 307 `/role-select`) |
|---|---|---|---|
| `/dashboard/owner/v2` | Dashboard principal de operaciones/métricas (shell de lectura). No realiza escrituras directas. | `owner`, `manager`, `encargado`, `staff`, `qa-b-owner` | NINGUNO |
| `/dashboard/owner` | Ruta legacy de dashboard (shell de lectura). | `owner`, `manager`, `encargado`, `staff`, `qa-b-owner` | NINGUNO |
| `/dashboard/manager` | Vista de gestión operativa sin acceso a datos P&L ni carga de archivos. | `owner`, `manager`, `encargado`, `staff`, `qa-b-owner` | NINGUNO |
| `/dashboard/pnl` | Módulo financiero confidencial (P&L / `WRITE_ROLES`). Acción de auditoría y escritura. | `owner`, `qa-b-owner` | `manager`, `encargado`, `staff` |
| `/dashboard/reconcile` | Conciliación de ventas CucinaGo vs Maxirest (`WRITE_ROLES`). Acción de auditoría crítica. | `owner`, `qa-b-owner` | `manager`, `encargado`, `staff` |
| `/dashboard/upload` | Carga masiva de archivos P&L/Ventas/Ítems (`WRITE_ROLES`). Mutación de datos. | `owner`, `qa-b-owner` | `manager`, `encargado`, `staff` |
| `/dashboard/owner/v2?modulo=operaciones` | Sub-ruta/query param en dashboard principal. Debe mantener el acceso del prefix `/dashboard/owner/v2`. | `owner`, `manager`, `encargado`, `staff`, `qa-b-owner` | NINGUNO |
| `/dashboard/reportes-custom` | Ruta no listada explícitamente en reglas. Verifica el fallback por defecto (`ALL_DASHBOARD_ROLES`). | `owner`, `manager`, `encargado`, `staff`, `qa-b-owner` | NINGUNO |

### 2.1 Adenda: Matriz para Usuario Multi-Cardinalidad (`qa-owner@faropulse.test`)

`qa-owner@faropulse.test` cuenta con dos memberships activos en la misma organización:
1. `role: 'owner'` en **Demo Ituzaingó** (`bbbbbbbb-0000-0000-0000-000000000001`).
2. `role: 'encargado'` en **QA Multi - Sucursal Norte** (`f203a8fe-fc04-40d8-bc08-3c7571b4c008`).

| Local Seleccionado en UI | Rol en Local | Ruta Intentada | Expectativa Estricta de Negocio | Resultado Real Proxy / Middleware |
|---|---|---|---|---|
| Demo Ituzaingó | `owner` | `/dashboard/pnl` | `allow` (HTTP 200) | `allow` (HTTP 200) ✅ |
| Sucursal Norte | `encargado` | `/dashboard/pnl` | `deny` (HTTP 307 → `/role-select`) | **DEPENDIENTE DE LA COOKIE** (Ver Hallazgo 🔴 P0) |

---

## 3. Tabla Completa de Resultados de Ejecución Real contra STG

Ejecutado con sesiones autenticadas reales desde `.env.stg-test-users` evaluando el proxy/middleware del sistema:

| Rol Evaluado | Usuario / Email | Ruta Probada | HTTP Status | Es Redirect | URL Destino / Redirect | Resultado vs Esperado |
|---|---|---|---|---|---|---|
| `owner` | `qa-owner@faropulse.test` | `/dashboard/owner/v2` | `200` | No | `http://localhost:3000/dashboard/owner/v2` | **PASÓ (allow)** |
| `owner` | `qa-owner@faropulse.test` | `/dashboard/owner` | `200` | No | `http://localhost:3000/dashboard/owner` | **PASÓ (allow)** |
| `owner` | `qa-owner@faropulse.test` | `/dashboard/manager` | `200` | No | `http://localhost:3000/dashboard/manager` | **PASÓ (allow)** |
| `owner` | `qa-owner@faropulse.test` | `/dashboard/pnl` | `200` | No | `http://localhost:3000/dashboard/pnl` | **PASÓ (allow)** |
| `owner` | `qa-owner@faropulse.test` | `/dashboard/reconcile` | `200` | No | `http://localhost:3000/dashboard/reconcile` | **PASÓ (allow)** |
| `owner` | `qa-owner@faropulse.test` | `/dashboard/upload` | `200` | No | `http://localhost:3000/dashboard/upload` | **PASÓ (allow)** |
| `owner` | `qa-owner@faropulse.test` | `/dashboard/owner/v2?modulo=operaciones` | `200` | No | `http://localhost:3000/dashboard/owner/v2?modulo=operaciones` | **PASÓ (allow)** |
| `owner` | `qa-owner@faropulse.test` | `/dashboard/reportes-custom` | `200` | No | `http://localhost:3000/dashboard/reportes-custom` | **PASÓ (allow)** |
| `manager` | `qa-manager@faropulse.test` | `/dashboard/owner/v2` | `200` | No | `http://localhost:3000/dashboard/owner/v2` | **PASÓ (allow)** |
| `manager` | `qa-manager@faropulse.test` | `/dashboard/owner` | `200` | No | `http://localhost:3000/dashboard/owner` | **PASÓ (allow)** |
| `manager` | `qa-manager@faropulse.test` | `/dashboard/manager` | `200` | No | `http://localhost:3000/dashboard/manager` | **PASÓ (allow)** |
| `manager` | `qa-manager@faropulse.test` | `/dashboard/pnl` | `307` | Sí | `http://localhost:3000/role-select` | **PASÓ (deny)** |
| `manager` | `qa-manager@faropulse.test` | `/dashboard/reconcile` | `307` | Sí | `http://localhost:3000/role-select` | **PASÓ (deny)** |
| `manager` | `qa-manager@faropulse.test` | `/dashboard/upload` | `307` | Sí | `http://localhost:3000/role-select` | **PASÓ (deny)** |
| `manager` | `qa-manager@faropulse.test` | `/dashboard/owner/v2?modulo=operaciones` | `200` | No | `http://localhost:3000/dashboard/owner/v2?modulo=operaciones` | **PASÓ (allow)** |
| `manager` | `qa-manager@faropulse.test` | `/dashboard/reportes-custom` | `200` | No | `http://localhost:3000/dashboard/reportes-custom` | **PASÓ (allow)** |
| `encargado` | `qa-encargado@faropulse.test` | `/dashboard/owner/v2` | `200` | No | `http://localhost:3000/dashboard/owner/v2` | **PASÓ (allow)** |
| `encargado` | `qa-encargado@faropulse.test` | `/dashboard/owner` | `200` | No | `http://localhost:3000/dashboard/owner` | **PASÓ (allow)** |
| `encargado` | `qa-encargado@faropulse.test` | `/dashboard/manager` | `200` | No | `http://localhost:3000/dashboard/manager` | **PASÓ (allow)** |
| `encargado` | `qa-encargado@faropulse.test` | `/dashboard/pnl` | `307` | Sí | `http://localhost:3000/role-select` | **PASÓ (deny)** |
| `encargado` | `qa-encargado@faropulse.test` | `/dashboard/reconcile` | `307` | Sí | `http://localhost:3000/role-select` | **PASÓ (deny)** |
| `encargado` | `qa-encargado@faropulse.test` | `/dashboard/upload` | `307` | Sí | `http://localhost:3000/role-select` | **PASÓ (deny)** |
| `encargado` | `qa-encargado@faropulse.test` | `/dashboard/owner/v2?modulo=operaciones` | `200` | No | `http://localhost:3000/dashboard/owner/v2?modulo=operaciones` | **PASÓ (allow)** |
| `encargado` | `qa-encargado@faropulse.test` | `/dashboard/reportes-custom` | `200` | No | `http://localhost:3000/dashboard/reportes-custom` | **PASÓ (allow)** |
| `staff` | `qa-staff@faropulse.test` | `/dashboard/owner/v2` | `200` | No | `http://localhost:3000/dashboard/owner/v2` | **PASÓ (allow)** |
| `staff` | `qa-staff@faropulse.test` | `/dashboard/owner` | `200` | No | `http://localhost:3000/dashboard/owner` | **PASÓ (allow)** |
| `staff` | `qa-staff@faropulse.test` | `/dashboard/manager` | `200` | No | `http://localhost:3000/dashboard/manager` | **PASÓ (allow)** |
| `staff` | `qa-staff@faropulse.test` | `/dashboard/pnl` | `307` | Sí | `http://localhost:3000/role-select` | **PASÓ (deny)** |
| `staff` | `qa-staff@faropulse.test` | `/dashboard/reconcile` | `307` | Sí | `http://localhost:3000/role-select` | **PASÓ (deny)** |
| `staff` | `qa-staff@faropulse.test` | `/dashboard/upload` | `307` | Sí | `http://localhost:3000/role-select` | **PASÓ (deny)** |
| `staff` | `qa-staff@faropulse.test` | `/dashboard/owner/v2?modulo=operaciones` | `200` | No | `http://localhost:3000/dashboard/owner/v2?modulo=operaciones` | **PASÓ (allow)** |
| `staff` | `qa-staff@faropulse.test` | `/dashboard/reportes-custom` | `200` | No | `http://localhost:3000/dashboard/reportes-custom` | **PASÓ (allow)** |
| `qa-b-owner` (Tenant B) | `qa-b-owner@faropulse.test` | `/dashboard/owner/v2` | `200` | No | `http://localhost:3000/dashboard/owner/v2` | **PASÓ (allow)** |
| `qa-b-owner` (Tenant B) | `qa-b-owner@faropulse.test` | `/dashboard/owner` | `200` | No | `http://localhost:3000/dashboard/owner` | **PASÓ (allow)** |
| `qa-b-owner` (Tenant B) | `qa-b-owner@faropulse.test` | `/dashboard/manager` | `200` | No | `http://localhost:3000/dashboard/manager` | **PASÓ (allow)** |
| `qa-b-owner` (Tenant B) | `qa-b-owner@faropulse.test` | `/dashboard/pnl` | `200` | No | `http://localhost:3000/dashboard/pnl` | **PASÓ (allow)** |
| `qa-b-owner` (Tenant B) | `qa-b-owner@faropulse.test` | `/dashboard/reconcile` | `200` | No | `http://localhost:3000/dashboard/reconcile` | **PASÓ (allow)** |
| `qa-b-owner` (Tenant B) | `qa-b-owner@faropulse.test` | `/dashboard/upload` | `200` | No | `http://localhost:3000/dashboard/upload` | **PASÓ (allow)** |
| `qa-b-owner` (Tenant B) | `qa-b-owner@faropulse.test` | `/dashboard/owner/v2?modulo=operaciones` | `200` | No | `http://localhost:3000/dashboard/owner/v2?modulo=operaciones` | **PASÓ (allow)** |
| `qa-b-owner` (Tenant B) | `qa-b-owner@faropulse.test` | `/dashboard/reportes-custom` | `200` | No | `http://localhost:3000/dashboard/reportes-custom` | **PASÓ (allow)** |

---

## 4. ANÁLISIS DE CASO MULTI-CARDINALIDAD (Respuestas con Evidencia Empírica)

### Pregunta 1: Al loguearse, ¿qué location resuelve el sistema como "la actual"? ¿Es determinístico entre logins sucesivos? Probá 3 veces y compará.

**EVIDENCIA EMPÍRICA:**
En 3 logins consecutivos realizados contra STG sin `faro_active_membership` en `localStorage`, la consulta a Supabase devolvió el siguiente orden en el array:
- Elemento 0: `role: 'owner'`, `location_id: 'bbbbbbbb-0000-0000-0000-000000000001'` (Demo Ituzaingó)
- Elemento 1: `role: 'encargado'`, `location_id: 'f203a8fe-fc04-40d8-bc08-3c7571b4c008'` (QA Multi - Sucursal Norte)

`AuthProvider.tsx` implementa el fallback:
`activeMembership = (storedId ? ...) ?? memberships.find(m => m.location_id) ?? null`

- **Resultado:** Resuelve siempre **Demo Ituzaingó** (`bbbbbbbb-...`).
- **Determinismo:** **SÍ, es determinístico** entre logins sucesivos. El orden viene dado por la consulta SQL a `memberships` que preserva el orden primario de creación (`created_at` 2026-07-29 vs 2026-08-15).

---

### Pregunta 2: ¿Con qué rol lo evalúa `proxy.ts`? ¿owner, encargado, o la unión de ambos?

**EVIDENCIA EMPÍRICA:**
`proxy.ts` inspecciona la cookie `faro_role` recibida en la petición y ejecuta:
```sql
SELECT id FROM memberships 
WHERE user_id = 'ff944662-1fed-4d78-a1c6-48b6fac9d316' 
  AND role = cookieRole 
  AND is_active = true 
LIMIT 1;
```
- Si la cookie `faro_role` contiene `'encargado'`, la BD devuelve el registro de la Sucursal Norte y `proxy.ts` lo evalúa como **`encargado`** (bloquea `/dashboard/pnl` con 307).
- Si la cookie `faro_role` contiene `'owner'`, la BD devuelve el registro de Demo Ituzaingó y `proxy.ts` lo evalúa como **`owner`** (permite `/dashboard/pnl` con 200).
- **Resultado:** No hace unión de roles en una sola evaluación; lo evalúa **según el valor exacto de la cookie `faro_role`**.

---

### Pregunta 3: ¿Puede navegar a `/dashboard/pnl` (ruta de owner) mientras tiene seleccionada la Sucursal Norte, donde es encargado?

> [!CAUTION]
> 🔴 **HALLAZGO CRÍTICO P0 — ESCALAMIENTO DE PRIVILEGIOS ENTRE LOCALES (Cross-Location Privilege Escalation)**

**EVIDENCIA EMPÍRICA Y RESPUESTA:**
**SÍ.**  
- **Causa Raíz:** En `proxy.ts`, la consulta de validación de membresía contra Supabase es:
  `from('memberships').select('id').eq('user_id', user.id).eq('role', cookieRole).eq('is_active', true)`
  **Atención:** La consulta NO incluye `.eq('location_id', activeLocationId)` ni valida que el `cookieRole` pertenezca al local que la aplicación cliente está consultando.
- **Mecanismo del Bug:** Si el usuario selecciona "QA Multi - Sucursal Norte" en la aplicación cliente (donde es solo `encargado`), pero envía o mantiene la cookie `faro_role=owner` (que posee por ser owner en Demo Ituzaingó), `proxy.ts` valida que el usuario efectivamente tiene UN membership de tipo `owner` en la BD y **le otorga acceso HTTP 200 a `/dashboard/pnl`**.
- La pantalla P&L se renderiza en el cliente y consulta los datos financieros de la Sucursal Norte, **exponiendo información financiera restringida a un usuario actuando en el contexto de una sucursal donde solo es encargado**.

---

### Pregunta 4: Si hay selector de local en la UI, ¿cambiar de local cambia lo que puede navegar?

**EVIDENCIA EMPÍRICA:**
- En el flujo estándar de UI, la página `/role-select` invoca `setActiveMembership(m.id)`, el cual ejecuta:
  `document.cookie = 'faro_role=' + membership.role`
- Cuando el usuario utiliza el selector de la UI para cambiar a "Sucursal Norte", la cookie pasa a ser `faro_role=encargado`. Al navegar normalmente por clicks, `proxy.ts` lee `encargado` y lo redirige a `/role-select` si intenta acceder a P&L.
- **Sin embargo, la vulnerabilidad P0 persiste:** Al no estar vinculadas la cookie de rol y la location activa en el servidor (`proxy.ts`), cualquier manipulación de cookie o pestaña secundaria abierta permite saltarse la restricción.

---

## 5. DIFERENCIAS CON LO REPORTADO POR CC

Se realizó la comparación entre la verificación independiente de QA y el reporte de Claude Code (CC):

- **Reportado por CC:**
  - Owner: Status 200 en las rutas probadas.
  - Manager / Encargado / Staff: Redirect HTTP 307 a `/role-select` en `/dashboard/pnl`, `/dashboard/reconcile` y `/dashboard/upload`.
  - Acceso permitido (HTTP 200) a `/dashboard/owner/v2?modulo=operaciones`.
- **Resultado de QA:**
  - **Coincidencia 100% Exacta** para casos de cardinalidad simple N=1.
  - **Falta descubierta en N=2:** CC no identificó la vulnerabilidad 🔴 **P0 de Escalamiento de Privilegios entre Locales** introducida cuando un usuario posee múltiples memberships con distintos roles entre sucursales.
