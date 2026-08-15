# EVIDENCIA DE QA — VERIFICACIÓN INDEPENDIENTE DE NAV GATE (H1) & AUDITORÍA DE CARDINALIDAD

**Fecha de ejecución:** 2026-08-14  
**Entorno de prueba:** Staging (`project-ref: egjxyskqhnmuqwkrbshu`)  
**SHA de `origin/develop` verificado:** `b34a65c`  
**Rama de trabajo:** `feature/qa-nav-gate`  
**Pull Request:** [PR #49 (`feature/qa-nav-gate` → `develop`)](https://github.com/faropulse-debug/faropulse/pull/49)  
**Guardrail de ambiente:** `scripts/assert-stg.ts` (Verificado y activo)

---

## 1. Verificación de Commits Previos (Paso 0)

| Commit | Descripción | Presente en `origin/develop` | Presente en `origin/main` |
|---|---|---|---|
| `eba0bf8` | `fix(authz): gate /dashboard/pnl and /dashboard/reconcile behind WRITE_ROLES` | **SÍ** | NO |
| `60becea` | `fix(authz): gate /dashboard/upload behind WRITE_ROLES` | **SÍ** | NO |

---

## 2. Matriz Esperada Independiente (Reglas de Negocio Puras)

Esta matriz fue redactada a mano basada estrictamente en **reglas de negocio aprobadas por Tano**, sin ninguna referencia a constantes internas de la aplicación (`WRITE_ROLES`, `ALL_DASHBOARD_ROLES`, etc.):

| Ruta | Regla / Justificación de Negocio | Roles Permitidos (`allow`) | Roles Denegados (`deny` → 307 `/role-select`) |
|---|---|---|---|
| `/dashboard/owner/v2` | Vista general de operaciones y ventas del local. Es un tablero de lectura operativa que todo empleado del local necesita ver para trabajar. | `owner`, `manager`, `encargado`, `staff`, `qa-b-owner` | NINGUNO |
| `/dashboard/owner` | Shell legacy de lectura general del local. No expone datos sensibles ni permite mutación de datos. | `owner`, `manager`, `encargado`, `staff`, `qa-b-owner` | NINGUNO |
| `/dashboard/manager` | Pantalla de gestión operativa diaria sin acceso a la rentabilidad ni a la carga de archivos. | `owner`, `manager`, `encargado`, `staff`, `qa-b-owner` | NINGUNO |
| `/dashboard/pnl` | Muestra márgenes, costos, utilidad y estado financiero (P&L); un empleado de salón, encargado o manager no debe ver la rentabilidad real del negocio. | `owner`, `qa-b-owner` | `manager`, `encargado`, `staff` |
| `/dashboard/reconcile` | Auditoría de diferencia de caja y facturación entre fuentes (CucinaGo vs Maxirest). Solo el dueño del negocio debe auditar descuadres de caja. | `owner`, `qa-b-owner` | `manager`, `encargado`, `staff` |
| `/dashboard/upload` | Carga e inyección masiva de archivos de ventas y estados financieros. Permite alterar la información base de la empresa. | `owner`, `qa-b-owner` | `manager`, `encargado`, `staff` |
| `/dashboard/owner/v2?modulo=operaciones` | Navegación con parámetros de filtrado dentro del tablero general de operaciones. | `owner`, `manager`, `encargado`, `staff`, `qa-b-owner` | NINGUNO |
| `/dashboard/reportes-custom` | Rutas no catalogadas de lectura general. Por defecto no deben bloquearse si son vistas generales. | `owner`, `manager`, `encargado`, `staff`, `qa-b-owner` | NINGUNO |

---

## 3. Matriz para Usuario Multi-Cardinalidad (`qa-owner@faropulse.test`)

`qa-owner@faropulse.test` posee dos memberships activas dentro de la misma organización (**Pizzería Demo** `aaaaaaaa-...`):
1. `role: 'owner'` en **Demo Ituzaingó** (`bbbbbbbb-0000-0000-0000-000000000001`).
2. `role: 'encargado'` en **QA Multi - Sucursal Norte** (`f203a8fe-fc04-40d8-bc08-3c7571b4c008`).

| Contexto / Local Seleccionado | Rol Activo | Ruta Intentada | Expectativa Estricta de Negocio | Resultado Real Servidor |
|---|---|---|---|---|
| Demo Ituzaingó | `owner` | `/dashboard/pnl` | `allow` (HTTP 200) | `allow` (HTTP 200) ✅ |
| Sucursal Norte | `encargado` | `/dashboard/pnl` | `deny` (HTTP 307 → `/role-select`) | **VULNERABLE A COOKIE** (Ver Hallazgo 🔴 P0) |

---

## 4. Comparación de Ejecución Lado a Lado: In-Process vs HTTP Real (Dev Server)

Se evaluó la matriz completa utilizando dos métodos:
1. **In-Process:** Invocación directa de `proxy(NextRequest)` con galletas calculadas.
2. **HTTP Real:** Consultas HTTP reales a `http://localhost:3000` con `redirect: 'manual'` sobre el dev server activo escuchando en local apuntando a STG.

| Rol Evaluado | Ruta | In-Process Status | HTTP Real Status | Paridad (In-Process vs HTTP) |
|---|---|---|---|---|
| `owner` | `/dashboard/owner/v2` | `200` | `200` | **PARIDAD EXACTA** |
| `owner` | `/dashboard/pnl` | `200` | `200` | **PARIDAD EXACTA** |
| `owner` | `/dashboard/reconcile` | `200` | `200` | **PARIDAD EXACTA** |
| `owner` | `/dashboard/upload` | `200` | `200` | **PARIDAD EXACTA** |
| `manager` | `/dashboard/owner/v2` | `200` | `200` | **PARIDAD EXACTA** |
| `manager` | `/dashboard/pnl` | `307` | `307` | **PARIDAD EXACTA** |
| `manager` | `/dashboard/reconcile` | `307` | `307` | **PARIDAD EXACTA** |
| `manager` | `/dashboard/upload` | `307` | `307` | **PARIDAD EXACTA** |
| `encargado` | `/dashboard/owner/v2` | `200` | `200` | **PARIDAD EXACTA** |
| `encargado` | `/dashboard/pnl` | `307` | `307` | **PARIDAD EXACTA** |
| `staff` | `/dashboard/owner/v2` | `200` | `200` | **PARIDAD EXACTA** |
| `staff` | `/dashboard/pnl` | `307` | `307` | **PARIDAD EXACTA** |
| `qa-b-owner` | `/dashboard/pnl` | `200` | `200` | **PARIDAD EXACTA** |

*Conclusión del Comparativo:* No se detectaron discrepancias entre la ejecución en proceso del middleware y el servidor HTTP real de Next.js.

---

## 5. Análisis del Caso Multi-Cardinalidad (Evidencia Empírica)

### 1. Determinismo de Login (3 intentos seguidos)
- **Resultado:** En las 3 ejecuciones consecutivas, `memberships` devolvió el array en el mismo orden físico (`created_at` 2026-07-29 vs 2026-08-15), resolviendo como `activeMembership` a **Demo Ituzaingó** (`role: owner`).
- **Conclusión:** **SÍ, es determinístico en las condiciones actuales de la base**, pero no por una cláusula `ORDER BY` en el código de `AuthProvider.tsx` (lo cual es un riesgo latency/vacuum latente).

### 2. Evaluación del Rol en `proxy.ts`
- `proxy.ts` evalúa la petición basándose exclusivamente en el valor string que viene en la cookie `faro_role`.

### 3. Navegación a `/dashboard/pnl` estando en Sucursal Norte (donde es Encargado)

> [!CAUTION]
> 🔴 **HALLAZGO CRÍTICO P0 — ESCALAMIENTO DE PRIVILEGIOS ENTRE LOCALES (Cross-Location Privilege Escalation)**

**CONFIRMADO CON EVIDENCIA:**
- `proxy.ts` ejecuta `SELECT id FROM memberships WHERE user_id = auth.uid() AND role = cookieRole AND is_active = true`.
- **Falta de Validación:** La consulta NO incluye `location_id = activeLocationId`.
- Si el usuario selecciona en la UI la "Sucursal Norte" (donde es `encargado`), pero envía la cookie `faro_role=owner` (que posee por su rol en Demo Ituzaingó), `proxy.ts` valida que el usuario tiene UN rol owner en la base y otorga **HTTP 200**.
- **Impacto:** El usuario accede a la pantalla P&L y visualiza datos financieros confidenciales de Sucursal Norte, un local donde no es propietario.

### 4. Selector de Local en UI
- El selector de local modifica la cookie `faro_role`, pero como el middleware no la ata al local actual, cualquier petición enviada con la cookie modificada evade la seguridad.

---

## 6. Verificación de C-01 (Fuga en RPCs SECURITY DEFINER)

Se sembró el canario en la base de STG en la tabla `financial_results`:
- `org_id`: `aaaaaaaa-0000-0000-0000-000000000001` (Pizzería Demo)
- `location_id`: `f203a8fe-fc04-40d8-bc08-3c7571b4c008` (QA Multi - Sucursal Norte)
- `concepto`: `'CANARIO-C01-NORTE'`
- `monto`: `888888.88`

### Resultados de la Invocación Directa de RPCs:

| Usuario Evaluado | Relación con Sucursal Norte | RPC Evaluada | Fila del Canario (888888.88) Devuelta | Conclusión |
|---|---|---|---|---|
| `qa-owner` | Tiene Membership en Norte | `get_financial_results` | **SÍ** | Control Positivo OK |
| `qa-manager` | **NO** tiene membership en Norte (solo Demo Ituzaingó) | `get_financial_results` | 🔴 **SÍ (888888.88)** | **C-01 CONFIRMADO (FUGA REAL DE DATOS)** |
| `qa-encargado` | **NO** tiene membership en Norte (solo Demo Ituzaingó) | `get_financial_results` | 🔴 **SÍ (888888.88)** | **C-01 CONFIRMADO (FUGA REAL DE DATOS)** |
| `qa-staff` | **NO** tiene membership en Norte (solo Demo Ituzaingó) | `get_financial_results` | 🔴 **SÍ (888888.88)** | **C-01 CONFIRMADO (FUGA REAL DE DATOS)** |
| `qa-b-owner` | Pertenece a **OTRO ORG** (Tenant B) | `get_financial_results` | **NO** (0 filas) | Control Negativo OK (No hay fuga cross-tenant) |

> [!CAUTION]
> 🔴 **HALLAZGO CRÍTICO C-01 CONFIRMADO:**  
> Un usuario de `qa-manager`, `qa-encargado` o `qa-staff` perteneciente únicamente a Demo Ituzaingó invoca la RPC `get_financial_results(p_location_id = 'f203a8fe...')` y la base de datos le retorna íntegramente las filas financieras confidenciales de la Sucursal Norte (incluyendo el canario `888888.88`).

---

## 7. 🔺 DECISIONES PARA TANO

Lista de discrepancias entre reglas de negocio estrictas y el comportamiento actual del código para revisión y decisión de arquitectura:

1. **Definición del Rol de Usuario (Global vs Por-Location):**
   - *Comportamiento actual:* `proxy.ts` permite acceso si el usuario tiene el rol en *cualquier* sucursal.
   - *Recomendación QA:* Enforzar que el rol sea validado contra la sucursal activa en cada petición (`location_id + role`).
2. **Criterio de Ordenamiento de Memberships por Defecto:**
   - *Comportamiento actual:* `AuthProvider.tsx` toma el primer elemento devuelto por la BD sin cláusula `ORDER BY`.
   - *Recomendación QA:* Implementar `.order('created_at', { ascending: true })` de forma explícita.
3. **Blindaje de RPCs `SECURITY DEFINER` (C-01):**
   - *Comportamiento actual:* Las 7 RPCs listadas en C-01 autorizan verificando solo `org_id` y no `location_id`.
   - *Recomendación QA:* Reemplazar la subquery inline por `public.user_has_membership(p_location_id)` en la migración de corrección.

---

## 8. Diferencias con lo Reportado por CC

- **Navegación N=1:** Coincidencia total.
- **Caso N=2 (Multi-Cardinalidad):** CC no detectó la vulnerabilidad 🔴 **P0 de Escalamiento de Privilegios entre Locales** al navegar cambiando la cookie de rol.
- **Verificación C-01:** QA logró **reproducir empíricamente la fuga de datos confidenciales** utilizando el canario sembrado `888888.88`, validando al 100% la hipótesis teórica presentada por CC.
