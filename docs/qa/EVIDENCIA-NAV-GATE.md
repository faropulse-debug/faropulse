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
| `/dashboard/owner/v2` | Dashboard principal de métricas/operaciones (shell de lectura). No realiza escrituras directas. | `owner`, `manager`, `encargado`, `staff`, `qa-b-owner` | NINGUNO |
| `/dashboard/owner` | Ruta legacy de dashboard (shell de lectura). | `owner`, `manager`, `encargado`, `staff`, `qa-b-owner` | NINGUNO |
| `/dashboard/manager` | Vista de gestión operativa sin acceso a datos P&L ni carga de archivos. | `owner`, `manager`, `encargado`, `staff`, `qa-b-owner` | NINGUNO |
| `/dashboard/pnl` | Módulo financiero confidencial (P&L / `WRITE_ROLES`). Acción de auditoría y escritura. | `owner`, `qa-b-owner` | `manager`, `encargado`, `staff` |
| `/dashboard/reconcile` | Conciliación de ventas CucinaGo vs Maxirest (`WRITE_ROLES`). Acción de auditoría crítica. | `owner`, `qa-b-owner` | `manager`, `encargado`, `staff` |
| `/dashboard/upload` | Carga masiva de archivos P&L/Ventas/Ítems (`WRITE_ROLES`). Mutación de datos. | `owner`, `qa-b-owner` | `manager`, `encargado`, `staff` |
| `/dashboard/owner/v2?modulo=operaciones` | Sub-ruta/query param en dashboard principal. Debe mantener el acceso del prefix `/dashboard/owner/v2`. | `owner`, `manager`, `encargado`, `staff`, `qa-b-owner` | NINGUNO |
| `/dashboard/reportes-custom` | Ruta no listada explícitamente en reglas. Verifica el fallback por defecto (`ALL_DASHBOARD_ROLES`). | `owner`, `manager`, `encargado`, `staff`, `qa-b-owner` | NINGUNO |

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

## 4. DIFERENCIAS CON LO REPORTADO POR CC

Se realizó la comparación entre la verificación independiente de QA y el reporte de Claude Code (CC):

- **Reportado por CC:**
  - Owner: Status 200 en las rutas probadas.
  - Manager / Encargado / Staff: Redirect HTTP 307 a `/role-select` en `/dashboard/pnl`, `/dashboard/reconcile` y `/dashboard/upload`.
  - Acceso permitido (HTTP 200) a `/dashboard/owner/v2?modulo=operaciones`.
- **Resultado de QA:**
  - **Coincidencia 100% Exacta:** Los comportamientos observados en la ejecución real contra STG coinciden plenamente con el reporte de CC.
  - Adicionalmente, QA confirmó que `qa-b-owner` (Tenant B) exhibe el mismo comportamiento exacto de navegación por rol que `qa-owner` (el gate de navegación es estrictamente por rol y no por tenant).
  - Asimismo, se verificó el comportamiento de fallback para rutas no declaradas en la tabla (`/dashboard/reportes-custom`), comprobando que no bloquea páginas no sensibles.
