# Contexto del proyecto FARO-APP (para dar a Claude en el chat)

Copiá y pegá este bloque en tu conversación con Claude para dar contexto del proyecto.

---

## INICIO — Copiar desde aquí

**Proyecto: FARO-APP (FAROPULSE)**  
Es una aplicación web de **dashboard gastronómico** para restaurantes/negocios: métricas, punto de equilibrio, ventas por período y carga de datos desde Excel/CSV. Está en español (Argentina).

**Stack:**  
- Next.js 16 (App Router), React 19, TypeScript  
- Supabase: auth, base de datos, RPCs para agregados  
- Tailwind 4, Recharts (gráficos), xlsx (lectura Excel), lucide-react  

**Estructura principal:**  
- `app/`: layout, landing, login, forgot/reset password, role-select, dashboard/owner (dashboard + upload) y dashboard/manager (placeholder).  
- `components/dashboard/`: SectionLabel, KpiCard, PulsoCard, PeriodoSelector, PEBarChart, Sparkline, InsightBox, CustomTooltip.  
- `components/upload/`: UploadZone, StatusBadge, ProgressBar, ErrorTable, PreviewTable.  
- `hooks/`: useAuth (usuario, membresías, rol activo, setActiveMembership, signOut), useDashboardData(locationId) (llama 4 RPCs de Supabase).  
- `lib/`: supabase (cliente browser), format.ts (fmtPeso, fmtMillones, fmtPct), redirectAfterLogin, processors/excelProcessor (mapeo e insert por tabla; recibe locationId y orgId), validators/uploadValidator (esquemas y validación de archivos).  
- `types/auth.ts`: Role ('owner'|'manager'|'viewer'), UserProfile, Organization, Membership (org_id, location_id opcional, organization), AuthUser.  
- `middleware.ts`: protege rutas; exige sesión Supabase y cookie `faro_role` para /dashboard/owner y /dashboard/manager.  

**Flujo de auth:**  
Login → se cargan membresías (con organization) → si hay más de una o es owner se va a role-select → se elige vista (Dueño/Encargado) y se setea cookie `faro_role` y opcionalmente localStorage para membership activo → redirect a /dashboard/owner o /dashboard/manager.

**Multi-tenant:**  
El `locationId` (y `orgId` donde aplica) se obtiene de `user?.activeMembership?.location_id ?? user?.activeMembership?.org_id`, con fallback a `NEXT_PUBLIC_LOCATION_ID` / `NEXT_PUBLIC_ORG_ID`. Ese `locationId` se pasa a useDashboardData y al excelProcessor. El nombre que se muestra en el header del dashboard es `activeMembership?.organization?.name`.

**Datos del dashboard:**  
Cuatro RPCs en Supabase: get_ventas_semana, get_ventas_semanales, get_ventas_mensuales, get_financial_results (todas reciben `p_location_id`). Cada RPC valida que el usuario tenga permiso vía tabla `memberships` (auth.uid(), is_active, location_id u org_id). Los resultados alimentan gráficos de punto de equilibrio, “pulso” por período (semana/mes/6m) e insights; hay mocks cuando no hay datos o locationId vacío.

**Carga de datos (upload):**  
Cuatro tipos de tabla: ventas (sales_documents), stock (stock_movements), precios (product_prices), financial (financial_results). El usuario sube Excel/CSV; se valida con uploadValidator por esquema; excelProcessor hace chequeo de duplicados, preview y luego insert (o reemplazo) por lotes; se usa el locationId/orgId del membership activo.

**Estado actual:**  
- Componentes y lib/format ya extraídos; RPCs con validación de permisos; lint y typecheck configurados.  
- Pendientes menores: header del dashboard sigue inline; un console.warn en useDashboardData cuando locationId vacío; botón Exportar deshabilitado con “Próximamente”.  
- Vista Manager está en construcción. Documentación de análisis y mejoras en `docs/ANALISIS-ESTRUCTURA-Y-MEJORAS.md`.

---

## FIN — Copiar hasta aquí
