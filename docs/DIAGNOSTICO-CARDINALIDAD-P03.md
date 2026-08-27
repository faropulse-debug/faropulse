# Diagnóstico de Cardinalidad — P0.3

**SHA analizado:** `60becea` (origin/develop) · **Fecha:** 2026-08-14
**Alcance:** solo diagnóstico — ningún fix aplicado. `lib/page-access.ts`, `proxy.ts` y `tests/` se leyeron para el análisis (están explícitamente en el barrido) pero no se tocaron — Antigravity trabaja ahí en paralelo (`feature/qa-nav-gate`).

**⚠️ Addendum 2026-08-14 (mismo día, después de la primera versión):** Tano midió cardinalidad real en PROD y STG — ver §7 al final del documento. Resumen: **PROD nunca tuvo un usuario con 2+ memberships** (max histórico = 1). STG recién tiene su primer caso N=2, creado a mano por Tano el mismo día. Ningún hallazgo de este documento se disparó nunca solo, en ningún ambiente, con datos reales. Eso NO baja la gravedad de nada — cambia la pregunta de "¿pasó ya?" a **"¿pasa el día 1 que Sprint F provisione el primer usuario multi-local real?"**, que es una fecha concreta, no un riesgo hipotético lejano. Las líneas "¿Se dispara hoy en PROD?" dentro de cada hallazgo quedan tal cual se escribieron (antes de tener este dato) como registro de qué se sabía en cada momento — la respuesta real a todas es NO, y está en §7.

Precondición del sistema: `memberships` es la tabla real de cardinalidad N — un usuario puede
tener una fila por `(user_id, location_id)` (`UNIQUE (user_id, location_id)`, migración
`20260705000002`), con rol potencialmente distinto en cada una. Cualquier código que trate
"el rol", "el local" o "la org" del usuario como un valor singular está haciendo una asunción
que el modelo ya no garantiza desde esa migración (2026-07-05).

---

## 1. Tabla resumen

| Gravedad | Cantidad | Silencioso | ¿Dispara hoy en PROD/STG? | ¿Dispara día 1 de Sprint F? |
|---|---|---|---|---|
| CRÍTICO | 2 | 2 | NO (ver Addendum) | SÍ |
| ALTO | 2 | 2 | NO | SÍ |
| MEDIO | 4 (+1 nuevo, ver Addendum §7.2) | 3 silencioso / 1-2 no aplica (decisión de producto) | NO / no aplica | SÍ (M-01, M-03) · depende de la decisión (M-02) |
| BAJO | 3 | — | No aplica (ya protegidos, documentado el porqué) | No aplica |
| **Total** | **11** | **6-7 silenciosos** | **NO en ningún caso — ver Addendum** | **SÍ en 4 de 5 no-BAJO** |

**Ver Addendum (§7) antes de leer la columna "¿Dispara hoy?" de cada hallazgo individual — esas líneas se escribieron ANTES de tener los números de Tano y quedan como registro histórico de qué se sabía en cada momento, no como estado actual.**

**Estimación total de horas (solo de lo clasificado ALTO o CRÍTICO, lo demás es M/L de producto):** ~14-22h de trabajo de código, más el tiempo de decisión de producto en los ítems marcados 🔺 (no estimable en horas de dev).

No llegué a las ~40 entradas del límite de aviso — el barrido cerró en 10 hallazgos porque varios de los `.single()`/`.maybeSingle()`/`[0]` que encontré en el paso 1 resultaron protegidos por un `UNIQUE` constraint real (documentado en cada uno, no descartado sin mirar), y porque agrupé los 7 RPCs con el mismo bug de fondo en un solo hallazgo (C-01) en vez de repetir la misma explicación 7 veces.

---

## 2. SI ARREGLÁS SOLO 5, ARREGLÁ ESTOS

1. **C-01** — 7 RPCs `SECURITY DEFINER` (incluye `get_financial_results`, el que alimenta P&L) autorizan por membership a nivel de ORG en vez de LOCATION. Con 2+ locations en el mismo org, cualquier usuario con membership en Location A lee datos reales de Location B llamando el RPC directo. Esto es multi-tenant leakage dentro del mismo tenant.
2. **A-01** — `AuthProvider.buildUser()` elige la `activeMembership` por defecto sin `ORDER BY` — orden arbitrario de Postgres, no determinístico.
3. **M-02** — `super_admin` es solo un valor de enum en el `CHECK` constraint. No existe NINGUNA lógica en RLS/RPCs que le dé acceso cross-org. Sprint F no puede asumir que el rol ya "funciona", hay que construirlo.
4. **A-02** — `proxy.ts` valida el cookie `faro_role` contra "¿el usuario tiene ESE rol en ALGÚN lado?", no "¿en el local activo?". El gate real (`requireMembership`) sigue blindado, pero el gate de página no es tan preciso como parece.
5. **M-01** — `provision_membership()` escribe `role/org_id/location_id` singulares en `profiles`, que se pisan en cada alta nueva del mismo usuario en otro local. Hoy nadie lee esas columnas (verificado), pero es una mina para el primer script/endpoint admin de Sprint F que asuma que `profiles.role` es la fuente de verdad.

---

## 3. Hallazgos completos

### C-01 · `supabase/migrations/20260514000007_versioned_get_financial_results.sql:17-23` (+ 6 archivos más) · [CRÍTICO] · falla en silencio: SÍ

**Código** (idéntico, con variaciones cosméticas, en las 7 funciones — este es `get_financial_results`):
```sql
WHERE location_id = p_location_id
  AND EXISTS (
    SELECT 1 FROM memberships m
    JOIN locations l ON l.org_id = m.org_id
    WHERE m.user_id   = auth.uid()
      AND m.is_active = true
      AND l.id        = p_location_id
  )
```

**Asume:** que "tener una membership activa en el org" ⇒ "tener acceso a CUALQUIER location de ese org" — cierto antes de la migración multi-location (`20260705000000`, cuando `UNIQUE(user_id, org_id)` significaba una membership = todo el org), falso después (`UNIQUE(user_id, location_id)`, una membership = un local específico).

**Con N=1 hoy (org con 1 sola location):** funciona correctamente — no hay location B para filtrar.

**Con N=2 (org con 2+ locations, usuario con membership solo en Location A):** el `EXISTS` da `true` igual para `p_location_id = Location B`, porque solo verifica `l.org_id = m.org_id`, nunca `l.id = m.location_id` ni `m.location_id = p_location_id`. Devuelve datos reales de Location B.

**Funciones afectadas (definición actualmente vigente, `CREATE OR REPLACE` más reciente por archivo/fecha):**
| Función | Definición vigente | Consumida por (TS) |
|---|---|---|
| `get_financial_results` | `20260514000007` | `/api/pnl`, tab P&L |
| `get_daily_sales_full` | `20260721000001:30` | `useDashboardData.ts`, `useDashboardKpis.ts` |
| `get_weekly_sales_full` | `20260721000001:205` | `useDashboardData.ts` |
| `get_comensales_full` | `20260628000001:8` | `useDashboardKpis.ts` |
| `get_ticket_promedio_full` | `20260721000002:17` | `useDashboardKpis.ts` |
| `get_facturacion_kpis` | `20260628000001:58` | `EvolutivoChart.tsx`, `AlertasSection.tsx` |
| `get_proyecciones_kpis` | `20260628000001:196` | `AlertasSection.tsx` |

Todas están `GRANT EXECUTE ... TO authenticated` (verificado por archivo) — son invocables directo vía PostgREST (`POST /rest/v1/rpc/<función>`) por cualquier usuario logueado con JWT válido, sin pasar por ninguna pantalla. El bug es explotable sin bug de UI — alcanza con cambiar `location_id` en el body del RPC.

**Nota de alcance:** `user_has_membership()` (la función que respalda RLS) SÍ fue corregida el 2026-07-05 para chequear `m.location_id = p_location_id` directo, y las RLS policies sobre `sales_documents`, `financial_results`, `stock_movements`, etc. la usan correctamente. El problema es que estas 7 RPCs son `SECURITY DEFINER` — no heredan RLS del caller — y tienen su PROPIO chequeo inline, nunca actualizado al mismo criterio. Peor: en el mismo archivo `20260721000001_documento_peso_extend.sql`, funciones vecinas (`get_ventas_por_canal`, `get_ventas_semana`, etc.) SÍ fueron migradas a `user_has_membership(p_location_id)` en ese mismo commit — alguien ya conocía y aplicó el patrón correcto, y estas 2 (`get_daily_sales_full`, `get_weekly_sales_full`) quedaron afuera del barrido, no por desconocimiento sino por omisión.

**¿Se dispara hoy en PROD?** PENDIENTE — necesita el número de "orgs con 2+ locations" y, dentro de esos, si algún usuario tiene membership en un subconjunto (no todas) las locations del org. Si todo owner/manager actual tiene membership en TODAS las locations de su org, el bug existe pero no se dispara todavía con los usuarios reales; si hay algún encargado/staff de una sola sucursal en un org multi-local, se dispara ahora mismo.

**Arreglar implica:** reemplazar el `EXISTS(...JOIN locations l ON l.org_id = m.org_id...)` inline por `public.user_has_membership(p_location_id)` en las 7 funciones — el mismo cambio mecánico ya aplicado en `get_ventas_semana`/`get_descuentos_resumen`/etc. Riesgo bajo por función (`CREATE OR REPLACE`, misma firma, sin cambio de columnas), pero son 7 funciones que tocan el corazón financiero del dashboard — necesita verificación STG con el mismo patrón que P0.1 (usuario A no debe ver datos de local B) antes de tocar PROD.

**Estimación:** M (1-4h) — el cambio en sí es mecánico y rápido; el tiempo real está en armar el escenario de verificación (2 locations reales o sintéticas en el mismo org, usuario con membership en una sola) y confirmar en STG antes de aplicar en PROD.

---

### C-02 · `providers/AuthProvider.tsx:29-30` · [CRÍTICO-condicional] · falla en silencio: SÍ

**Código:**
```ts
supabase
  .from('memberships')
  .select('*, organization:organizations(id, name, slug, plan)')
  .eq('user_id', session.user.id)
  .eq('is_active', true),
```

**Asume:** que el orden en que Postgres devuelve las filas de `memberships` es estable/significativo. No hay `.order(...)`.

**Con N=1 hoy:** un solo resultado, el orden no importa.

**Con N=2:** el orden de las filas queda librado al plan de ejecución de Postgres (típicamente orden físico/de índice, pero no garantizado por el estándar SQL — puede cambiar con un `VACUUM`, un `ANALYZE`, o simplemente porque Postgres decide otro plan). Esto alimenta directamente a **A-01** (`activeMembership` por defecto) — lo marco como hallazgo separado porque la falta de `ORDER BY` es un bug independiente incluso si `AuthProvider` cambiara su lógica de selección de default.

**¿Se dispara hoy en PROD?** PENDIENTE — depende de cuántos usuarios tengan 2+ memberships activas.

**Arreglar implica:** agregar `.order('created_at')` o el criterio que Tano decida en 🔺2 (ver decisiones) — no es solo agregar un ORDER BY cualquiera, requiere decidir el criterio de default primero.

**Estimación:** S (< 1h) una vez resuelta la decisión de producto.

---

### A-01 · `providers/AuthProvider.tsx:41-44` · [ALTO] · falla en silencio: SÍ

**Código:**
```ts
const storedId = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null
const activeMembership =
  (storedId ? memberships.find(m => m.id === storedId && m.location_id) : null)
  ?? memberships.find(m => m.location_id)
  ?? null
```

**Asume:** que si no hay `localStorage` (usuario nuevo, dispositivo nuevo, cache limpiada), la PRIMERA membership con `location_id` no nulo del array es una elección razonable de default.

**Con N=1 hoy:** siempre correcto, es la única opción.

**Con N=2:** el usuario aterriza en un local arbitrario (el que Postgres devolvió primero — ver C-02) sin haber elegido nada. Mitigante real: `role-select/page.tsx` no usa este `activeMembership` para pre-seleccionar nada — el usuario siempre hace click explícito en una card ahí, y `proxy.ts` gatea por la cookie `faro_role` (que solo se setea al hacer ese click), no por `activeMembership`. Por eso NO es un bypass de autorización. Sí es visible/silencioso en cualquier componente que lea `useAuth().locationId/orgId/role` en la ventana entre "sesión cargada" y "usuario pasó por role-select" — hoy no encontré ninguno que lo haga (no hay redirect automático "si tenés 1 sola membership, saltate role-select" — cada login pasa por esa pantalla), pero es exactamente el tipo de atajo que alguien puede agregar en Sprint F sin darse cuenta de la trampa.

**¿Se dispara hoy en PROD?** PENDIENTE.

**Arreglar implica:** 🔺 DECISIÓN DE TANO — ¿cuál es el criterio de default cuando no hay `localStorage`? (más antigua, alfabético por nombre de local, rol owner primero, o simplemente no elegir default y forzar `role-select` siempre en ausencia de `localStorage`, que es casi el comportamiento actual pero explícito).

**Estimación:** S (< 1h) de código una vez haya criterio.

---

### A-02 · `proxy.ts:73-89` (leído, no modificado) · [ALTO] · falla en silencio: SÍ

**Código:**
```ts
const { data: mems, error: memErr } = await createClient(...)
  .from('memberships')
  .select('id')
  .eq('user_id', user.id)
  .eq('role', cookieRole)
  .eq('is_active', true)
  .limit(1)
```

**Asume:** que "el usuario tiene una membership activa con rol X" (sin filtrar por location) certifica que el cookie `faro_role=X` es legítimo para la sesión/local actual.

**Con N=1 hoy:** el único rol que puede tener es el de su única membership — el chequeo es correcto por construcción.

**Con N=2 con roles distintos por local** (ej: `owner` en Local A, `staff` en Local B): si el usuario tiene `activeMembership` = Local B (`staff`) pero el cookie quedó en `owner` (por ejemplo, cambió de local sin que el cookie se actualizara, o algún flujo futuro lee/escribe el cookie de forma distinta a `setActiveMembership()`), este chequeo lo deja pasar — tiene UNA membership `owner` en algún lado, no importa cuál. El usuario cargaría el bundle de una página `WRITE_ROLES` (ej. `/dashboard/pnl`) para un local donde en realidad es `staff`.

**Mitigante real:** `requireMembership()` (`lib/api-auth.ts`) es el gate de verdad para cualquier fetch de datos — ahí SÍ se filtra por `(user_id, location_id, is_active)`, así que ese `staff` que coló el cookie `owner` va a ver la página cargar y después recibir 403 en cada llamada a la API. No hay fuga de datos. Es una inconsistencia de UX/gate de página, no una fuga — por eso ALTO y no CRÍTICO.

**¿Se dispara hoy en PROD?** PENDIENTE — necesita "usuarios con 2+ roles distintos" del Paso 2. Con N=1 rol por usuario (aunque tenga 2+ locations), este hallazgo no se dispara nunca porque el cookie y la membership real siempre coinciden en rol.

**Arreglar implica:** cambiar el query para filtrar también por `location_id` (necesitaría que el cookie o alguna otra señal lleve el `location_id` activo, no solo el rol) — toca `proxy.ts`, que está fuera de mi alcance de edición en esta tarea (Antigravity trabaja ahí). Documento el hallazgo, no propongo el diff.

**Estimación:** M (1-4h) — el cambio en sí es simple, pero decidir qué identifica "el local activo" del lado servidor (¿otra cookie? ¿el `location_id` viaja en cada request?) es una decisión de diseño, no solo de código.

---

### M-01 · `supabase/migrations/20260728000002_add_provision_membership_function.sql:33-39` · [MEDIO] · falla en silencio: SÍ (si algo llegara a leerlo)

**Código:**
```sql
UPDATE public.profiles
SET role        = p_role,
    org_id      = p_org_id,
    location_id = p_location_id,
    full_name   = COALESCE(p_full_name, full_name)
WHERE id = p_user_id;
```

**Asume:** que `profiles` puede tener UN `role`/`org_id`/`location_id` por usuario — residuo del modelo pre-multi-location (`profiles.role/org_id/location_id` son columnas del schema original, `00000000000000_initial_schema.sql:16-23`, de cuando `memberships` todavía era `UNIQUE(user_id, org_id)`).

**Con N=1 hoy:** cada llamada a `provision_membership()` pisa las mismas 3 columnas con el mismo valor — inocuo.

**Con N=2 (mismo usuario, 2 locations):** la segunda llamada a `provision_membership()` (con otro `location_id`) sobreescribe silenciosamente lo que `profiles.role/org_id/location_id` tenían del primer alta. Verifiqué con grep en todo `app/`, `lib/`, `hooks/`, `providers/`, `src/` y en las policies RLS (`supabase/migrations/*.sql`) que **nada lee esas 3 columnas hoy** — ni código TS ni ninguna policy — así que el dato queda mal pero inerte.

**Agravante relacionado:** la policy `profiles_update_own` (`20260630000001_rls_complete_multitenant.sql:31`) es `FOR UPDATE USING (auth.uid() = id)` sin `WITH CHECK` explícito — Postgres usa el mismo `USING` como `WITH CHECK` por defecto, lo cual solo protege que `id` no cambie, no qué columnas se tocan. Cualquier usuario autenticado podría, en teoría, hacer `PATCH /profiles?id=eq.<su-id>` seteando su propio `role`/`org_id`/`location_id` vía PostgREST directo. Hoy es inofensivo porque nada lee esas columnas — pero el día que alguien las empiece a leer (¿un dashboard de admin en Sprint F que haga `SELECT role FROM profiles` porque es más corto que joinear `memberships`?), esto se convierte en auto-escalación de rol sin pasar por `provision_membership()`.

**¿Se dispara hoy en PROD?** El WRITE (corrupción del dato) sí puede estar disparado ya si algún usuario real fue provisionado en 2+ locations — PENDIENTE del número de Tano. El READ (uso del dato corrupto) no está disparado porque no hay lectores.

**Arreglar implica:** decisión de producto — ¿se borran esas 3 columnas de `profiles` (son vestigiales) o se dejan y se documenta "nunca leer esto, usar `memberships`"? Si se borran, tocar `provision_membership()` para no escribirlas. Separado: agregar `WITH CHECK` explícito a `profiles_update_own` que excluya esas columnas (o eliminarlas del todo, que resuelve ambos problemas a la vez).

**Estimación:** S (< 1h) el DROP COLUMN + ajuste de `provision_membership()`, si Tano decide que son vestigiales. L (> 4h) si en cambio se decide que `profiles` debe seguir siendo una vista "denormalizada" de la membership activa por alguna razón de performance/simplicidad que yo no tengo contexto para asumir — en ese caso hay que definir qué significa "la" membership activa a nivel DB (mismo problema de fondo que A-01, pero en el server).

---

### M-02 · (transversal — sin línea única) · [MEDIO] · 🔺 DECISIÓN DE TANO, no es un bug de código

**Hallazgo:** grep de `super_admin` en `supabase/migrations/*.sql` da un solo resultado real: el `CHECK` constraint que lo admite como valor válido de `memberships.role` (`20260705000003_memberships_role_check.sql:31`). No hay ninguna función, policy RLS, ni lógica en `user_has_membership()` que le dé a `super_admin` acceso distinto al de cualquier otro rol — necesita una fila de `memberships` por cada `location_id` al que deba acceder, exactamente igual que `owner`/`manager`/etc.

En el lado TS, `TABS.allowedRoles` y `canAccessModule` (client-side, solo visibilidad de UI) sí tratan a `super_admin` como equivalente a `owner` — pero eso es apariencia, no acceso real a datos: sin una fila de `memberships` en cada local, esas RPCs (incluso ya arregladas post-C-01) le van a devolver vacío o 403.

**Esto es exactamente el caso "multi-cardinalidad" que motiva Sprint F**, y hoy no está implementado, solo reservado como nombre de rol. No hay "arreglo" que yo pueda proponer sin una decisión de producto primero.

**🔺 DECISIÓN DE TANO:** ¿qué significa `super_admin` en términos de datos? Opciones típicas (no las estoy recomendando, solo nombrando para que la decisión sea concreta):
  (a) una fila de `memberships` por cada location que administra (mismo modelo que hoy, no escala bien más allá de unas pocas decenas de locations),
  (b) un flag/columna aparte (ej. `profiles.is_super_admin` o una tabla `super_admins`) que un `user_has_membership()` extendido chequee ANTES del `EXISTS` normal — bypass explícito,
  (c) algo scoped por org en vez de global (un "org admin" que ve todas las locations de SU org sin membership individual en cada una).

**¿Se dispara hoy en PROD?** No aplica — no es un bug que "dispare", es una funcionalidad no construida. Lo marco MEDIO porque bloquea Sprint F, no porque cause daño hoy.

**Estimación:** L (> 4h) — depende 100% de qué opción se elija; cualquiera de las 3 toca `user_has_membership()` (que a su vez respalda TODA la RLS del sistema) y probablemente las 7 RPCs de C-01 otra vez.

---

### B-01 · `providers/AuthProvider.tsx:21-25` · [BAJO] · falla en silencio: NO (tira error, visible)

**Código:**
```ts
supabase
  .from('profiles')
  .select('id, full_name')
  .eq('id', session.user.id)
  .single(),
```

**Por qué es BAJO:** `profiles.id` es `PRIMARY KEY REFERENCES auth.users(id)` — la cardinalidad 1 está garantizada por la base de datos, no por una asunción de la aplicación. No hay escenario N=2 posible salvo corrupción de datos a nivel de PK, que rompería mucho más que esta query. Si `.single()` fallara, sería un error visible (`profileResult.error`), no una fila arbitraria silenciosa — ya está manejado en la línea 33-36.

---

### B-02 · `lib/pos-config.ts:14-18` · [BAJO] · falla en silencio: NO (protegido por constraint)

**Código:**
```ts
.eq('location_id', locationId)
.eq('provider', 'cucinago')
.maybeSingle()
```

**Por qué es BAJO:** `location_pos_config` tiene `UNIQUE (location_id, provider)` (`supabase/migrations/20260704000001_location_pos_config.sql:24`) — el par que se está filtrando es exactamente la clave única de la tabla. `.maybeSingle()` no puede recibir 2+ filas salvo violación del constraint a nivel DB.

---

### B-03 · `lib/api-auth.ts:67-73` · [BAJO] · falla en silencio: NO (fail-closed, no fail-open)

**Código:**
```ts
const { data, error: memberError } = await svc
  .from('memberships')
  .select('id, role')
  .eq('user_id', userId)
  .eq('location_id', locationId)
  .eq('is_active', true)
  .maybeSingle()
```

**Por qué es BAJO:** protegido por `UNIQUE (user_id, location_id)` (`20260705000002`) — no puede haber 2 filas activas para el mismo `(user_id, location_id)`, así que `.maybeSingle()` nunca ve ambigüedad real. Documento esto explícitamente porque es la MISMA forma (`.maybeSingle()` sobre `memberships`) que causó el bug ya arreglado en `proxy.ts` (ver historial: QA-REPORT.md documentó un `PGRST116` con `.maybeSingle()` filtrado por `(user_id, role, is_active)` — sin `location_id`, sin protección de constraint). La diferencia es exactamente cuál combinación de columnas se filtra: acá SÍ coincide con la `UNIQUE`, en `proxy.ts` (antes del fix a `.limit(1)`) no coincidía. Vale la pena que quien lea esto sepa por qué una es segura y la otra no lo era, porque se ven idénticas a simple vista.

---

## 4. 🔺 DECISIONES DE TANO

1. **(de A-01)** ¿Cuál es el criterio de default para `activeMembership` cuando un usuario nuevo/sin `localStorage` tiene 2+ memberships? (más reciente / alfabético / rol owner primero / sin default, forzar selección siempre).
2. **(de M-02)** ¿Qué significa `super_admin` en términos de acceso a datos? ¿Membership por location (no escala), flag de bypass global, o admin scoped a nivel org? Esto determina el diseño de Sprint F, no al revés.
3. **(de M-01)** ¿Las columnas `profiles.role/org_id/location_id` se eliminan (vestigiales, nada las lee hoy) o se mantienen con algún propósito futuro que yo no tengo contexto para inferir?
4. **(de Addendum §7.3)** ¿El rol de un usuario es global (una identidad, un rol, válido en todos sus locales) o por-location (puede ser `owner` en el Local A y `staff` en el Local B, cada membership con su propio rol independiente)? El schema ya permite lo segundo (`UNIQUE(user_id, location_id)`, no `UNIQUE(user_id)`) y ningún código actual asume lo primero — pero el diseño de `canAccessModule`/`lib/authz.ts` para P0.1 necesita esta respuesta explícita antes de decidir si alguna vez debe recibir `role: Role` (uno) o `roles: Role[]` (todos los del usuario). Ver detalle y las dos implicaciones en §7.3 — no propongo la respuesta ahí tampoco.

---

## 5. Cómo esto afecta a Sprint F

**Hay que cerrar SÍ O SÍ antes de tocar super-admin:**
- **C-01** — si Sprint F expone `super_admin` con acceso real a múltiples locations/orgs, y el fix de C-01 no está aplicado, cualquier super_admin (o cualquier usuario, en realidad) que llegue a interactuar con esas 7 RPCs va a poder cruzar locations por fuera de lo que su membership real permite. Sprint F sin C-01 arreglado amplifica el hallazgo en vez de solo heredarlo — un rol diseñado explícitamente para cruzar límites de tenant es el peor lugar para tener un bug que ya cruza límites de tenant por accidente.
- **M-02** — es literalmente el prerequisito: hoy `super_admin` no tiene ninguna implementación de acceso cross-org. Sprint F ES la implementación de M-02. La decisión 🔺2 tiene que tomarse antes de escribir la primera línea de Sprint F, no durante.
- **A-02** — si Sprint F agrega alguna noción de "local activo" para super_admin distinta a la de otros roles (por ejemplo, un super_admin viendo la org de OTRO usuario), el gate de `proxy.ts` basado solo en rol (sin location) se vuelve aún más impreciso — vale la pena revisarlo junto con Antigravity antes de que Sprint F dependa de ese gate para algo más fino que "mostrar o no la página".
- **Decisión 🔺4 (§7.3, rol por-location vs global)** — es la que determina la FORMA de la solución de M-02, no un detalle posterior. Diseñar `canAccessModule`/`lib/authz.ts` con una unión de roles sin haber resuelto esto es exactamente cómo se cuela el bug "owner-en-A filtra a B" que describe §7.3, y Sprint F es el primer lugar donde ese usuario multi-rol va a existir de verdad.

**Puede esperar, pero conviene resolver antes de que el primer endpoint admin de Sprint F toque estas tablas:**
- **A-01** — afecta a cualquier usuario multi-location hoy, no es específico de super-admin. Vale la pena arreglarlo, pero no bloquea Sprint F per se.
- **M-01** — mientras nadie lea `profiles.role/org_id/location_id`, no bloquea nada. Igual lo dejaría resuelto antes de que el primer endpoint admin de Sprint F tenga la tentación de leer esas columnas "porque es más corto".
- **M-03 (§7.2)** — el `org_id` sin validar en las 6 tablas de datos es exactamente el tipo de columna que un panel cross-location de super_admin en Sprint F tentaría a usar como filtro directo ("traeme todo lo de este org"). Si Sprint F construye esa vista ANTES de que `org_id` se derive server-side (en vez de aceptarlo del cliente), hereda el problema directo — mejor cerrar M-03 antes de escribir esa query, no después de que falle en producción.
- **B-01, B-02, B-03** — no requieren acción, quedan documentados.

---

## 6. Qué NO revisé y por qué

- **Código de `app/api/**` más allá de `lib/api-auth.ts` y las 2-3 rutas de upload que grepeé para confirmar el uso de `requireMembership`.** No abrí cada route handler individualmente — asumí que todos pasan por `requireMembership()` (es el patrón documentado y consistente en los que sí miré) en vez de auditar archivo por archivo. Si alguna ruta llama a Supabase directo sin pasar por `requireMembership()`, no lo habría detectado.
- **`scripts/*.ts`** — son scripts de operación/regresión (`regression-test.ts`, `audit-rls.ts`, `diag-rls.ts`, etc.), no código de producción que sirva requests de usuarios reales. Los grepeé de pasada para el barrido de patrones pero no analicé su lógica de cardinalidad — no importan para P0.1/Sprint F salvo que alguno se use como base de un futuro endpoint admin.
- **`src/components/**` más allá de los 2-3 archivos (`AlertasSection.tsx`, `EvolutivoChart.tsx`) que aparecieron al buscar quién llama a las RPCs de C-01.** No audité componente por componente buscando asunciones de cardinalidad en props/estado de UI (ej. un componente que reciba `memberships[]` y renderice solo `memberships[0]` en algún lugar cosmético) — el barrido se concentró en los surfaces de identidad/autorización que pide la tarea, no en toda la superficie de UI.
- **Materialized view `daily_sales_summary`** (`20260328000000_widget_system.sql`, sección 2b) y sus RPCs asociadas (`get_facturacion_semana`, `get_facturacion_mes` y sus variantes versionadas) — el scan automatizado las marcó `OK(location-scoped)` porque usan `user_has_membership()`, pero no leí el cuerpo completo de la materialized view en sí para confirmar que su refresh/agregación no mezcla locations en algún JOIN interno. Es una superficie distinta (agregación pre-calculada, no un check de autorización) y quedó fuera del foco de "cardinalidad de identidad" que pide P0.3.
- **Cardinalidad real en datos (Paso 2).** Actualizado — ver §7.0. No tenía los números de Tano al momento de escribir la primera versión (toda columna "¿Se dispara hoy en PROD?" quedó en PENDIENTE tal como indica la consigna, sin inventar el dato); llegaron el mismo día y confirman NO en todos los casos, con la recalibración de "día 1 de Sprint F" ya incorporada en §7.0 y en la tabla resumen.
- **`recipes`, `upload_events`, `calendar_context`** y el resto de las tablas con RLS en `20260630000001` — las leí lo suficiente para confirmar que usan `user_has_membership(location_id)` correctamente (por eso no aparecen como hallazgo), pero no audité su lógica de negocio más allá del chequeo de autorización.

---

## 7. Addendum (2026-08-14) — datos reales de cardinalidad + 4 puntos pre-cargados

### 7.0 Datos reales (medidos por Tano)

| | memberships | locations | orgs | max memberships/usuario | roles |
|---|---|---|---|---|---|
| **PROD** | 2 | 1 | 1 | **1** | manager=1, owner=1 |
| **STG** | 8 | 3 | 3 | **1** (hasta que Tano agregó el primer N=2 a mano, hoy) | — |

**Recalibración:** ningún hallazgo de este documento se disparó nunca solo con datos reales, en ningún ambiente. La pregunta correcta no es "¿pasó ya?" (NO, en todos los casos) sino **"¿pasa el día que Sprint F provisione el primer usuario multi-local real?"** — y esa respuesta es SÍ para C-01, C-02, A-01, A-02, M-01 y M-03 (nuevo, ver 7.2), en todos los casos de forma inmediata y mecánica (no requiere ningún otro trigger además de la segunda fila de `memberships`).

---

### 7.1 `profiles` vs `memberships` — determinación de fuente canónica

Mapeo completo de call sites que leen `profiles.role`, `profiles.org_id` o `profiles.location_id` (TS + SQL, incluyendo alias tipo `p.role`, JOINs contra `profiles`, y `SELECT *` que pudiera arrastrarlas sin nombrarlas explícitamente):

```
grep -rniE "\bp\.role\b|\bp\.org_id\b|\bp\.location_id\b|profiles\.role|profiles\.org_id|profiles\.location_id" supabase/migrations/*.sql
  → 0 resultados

grep -rniE "FROM public\.profiles|FROM profiles\b|JOIN public\.profiles|JOIN profiles\b" supabase/migrations/*.sql
  → 0 resultados (ninguna función/policy hace JOIN ni SELECT contra profiles, salvo el propio provision_membership() que la ESCRIBE)

grep -rniE "profile\.role|profile\?\.role|profiles\.role" app/ lib/ hooks/ providers/ src/
  → 0 resultados

único SELECT contra profiles en todo el código (providers/AuthProvider.tsx:22-23):
  .from('profiles').select('id, full_name')   ← ni siquiera pide esas 3 columnas
```

**Conclusión con evidencia, no supuesto:** `memberships` es la fuente canónica hoy, por eliminación total — literalmente ningún lector de `profiles.role/org_id/location_id` existe en el código ni en RLS. `profiles` las tiene declaradas en el schema (`00000000000000_initial_schema.sql:18-20`) y `provision_membership()` las sigue escribiendo en cada alta (`20260728000002:33-39`, ya documentado como M-01), pero es un WRITE sin ningún READ correspondiente en todo el repo.

**Propuesta (no es una decisión de producto compleja, es limpieza de schema con evidencia clara detrás):** `profiles.role/org_id/location_id` deberían eliminarse. No hay ningún caso de uso activo que las necesite, y dejarlas es lo que ya causó una advertencia dentro de M-01 — la próxima persona que escriba una query rápida contra `profiles` porque "es una tabla, no un join" va a leer un dato que miente desde la segunda location que se provisione. Si hay una razón para mantenerlas que yo no tengo contexto para ver (¿algún reporte externo, alguna integración que las lea fuera de este repo?), esa razón es la que correspondería documentar antes de decidir que se quedan — hoy no encontré ninguna.

**"UNA DEFINICIÓN, UN LUGAR" aplicado:** el rol/org/local de un usuario tiene un solo lugar legítimo hoy (`memberships`, una fila por `(user_id, location_id)`). `profiles` con esas 3 columnas es una segunda definición que el DDL permite pero que ningún código usa — es deuda de esquema, no deuda de código.

---

### 7.2 `org_id` + `location_id` duplicados en las 10 tablas de datos

**Schema (`00000000000000_initial_schema.sql`):** `sales_documents`, `sales_items`, `stock_movements`, `product_prices`, `recipes`, `uploads` tienen `org_id uuid NOT NULL REFERENCES organizations(id)` Y `location_id uuid NOT NULL REFERENCES locations(id)` — **dos FKs independientes, sin ninguna relación declarada entre sí.** `financial_results` es peor: `org_id uuid NOT NULL` y `location_id uuid NOT NULL` **sin FK a nada** — ni siquiera se valida que esos UUIDs existan en `organizations`/`locations`.

**¿Puede existir una fila donde `org_id` no coincida con el `org_id` real de `location_id`?** Sí. Verifiqué:
```
grep -rniE "CHECK.*org_id.*location_id|CHECK.*location_id.*org_id|TRIGGER.*org_id|CONSTRAINT.*org_id.*location" supabase/migrations/*.sql
  → 0 resultados
```
No hay CHECK constraint, ni trigger, ni FK compuesta que ate `org_id` a `locations.org_id`. Cada columna se valida (cuando se valida) de forma completamente independiente.

**¿De dónde sale el `org_id` que se guarda?** Del cliente, directo, sin derivarlo server-side de `location_id`:
```
app/api/upload/sales/route.ts:21       const orgId = form.get('org_id') as string | null
app/api/upload/items/route.ts:21       const orgId = form.get('org_id') as string | null
app/api/upload/financial/route.ts:183  const orgId = form.get('org_id') as string | null
app/api/upload/cucinago/route.ts:213-214  const { from, to, org_id: orgId } = body
app/api/upload/[contract_id]/route.ts:34  const orgId = form.get('org_id') as string | null
```
`requireMembership(req, locationId, opts)` valida que el usuario tenga membership activa en `locationId` — nunca valida que el `org_id` que el mismo request trae por separado corresponda a ese `location_id`. En el flujo normal de la UI esto nunca diverge (ambos salen del mismo `activeMembership` en `useAuth()`), pero no hay ningún chequeo server-side que lo garantice — es una invariante que depende 100% de que el cliente se porte bien.

**¿Las queries filtran por uno, por otro, o por los dos?** Confirmé que **ninguna** de las funciones RPC actuales filtra datos de negocio (`sales_documents`, `financial_results`, etc.) por `org_id` solo — todas usan `WHERE location_id = p_location_id`. `org_id` se usa únicamente dentro del chequeo de autorización de las RPCs vulnerables de C-01 (y ahí el `org_id` que importa es el de la tabla `locations`, no el de `sales_documents`/`financial_results` — así que ni siquiera el bug de C-01 se ve agravado directamente por este hallazgo). Por eso **no hay ruta de lectura activa hoy que exponga datos por esta causa** — es acumulación silenciosa de un dato no confiable, esperando que la primera query futura que agregue "por org" (un panel cross-location para `super_admin` en Sprint F es el candidato obvio) confíe en una columna que nunca fue validada.

**Nuevo hallazgo:**

#### M-03 · `app/api/upload/{sales,items,financial,cucinago,[contract_id]}/route.ts` + schema de 6 tablas · [MEDIO] · falla en silencio: SÍ (el día que alguien filtre por org_id)

**Asume:** que el `org_id` que el cliente manda en el mismo request que `location_id` va a coincidir siempre con `locations.org_id` de ese `location_id` — sin validarlo ni derivarlo server-side.

**Con N=1 hoy:** cada usuario tiene una sola membership, un solo `(org_id, location_id)` posible en su `activeMembership` — no hay forma de que diverjan en el flujo normal.

**Con N=2 (usuario con memberships en 2 orgs distintos, o simple bug de front que mezcle el `orgId` de un membership con el `locationId` de otro):** una fila de `sales_documents`/`financial_results`/etc. puede terminar con `org_id` que no corresponde a su `location_id` real. Ninguna query de HOY lo nota (todas filtran por `location_id`), pero es exactamente el tipo de fila que una vista cross-org de Sprint F leería mal, silenciosamente — sin ningún error, sin ningún constraint que lo hubiera evitado en el `INSERT`.

**¿Se dispara hoy en PROD/STG?** NO (ver 7.0) — y aunque hubiera un N=2 real, tampoco se manifestaría todavía porque no hay ningún lector de `org_id` solo.

**Arreglar implica:** decidir la fuente de verdad de `org_id` en estas 6+ tablas — lo más simple es dejar de aceptarlo del cliente y derivarlo server-side con `SELECT org_id FROM locations WHERE id = $locationId` dentro de cada route handler (o agregar una FK compuesta / trigger `BEFORE INSERT` que lo fuerce a nivel DB, más robusto pero más trabajo). `financial_results` además necesita las FKs que nunca tuvo.

**Estimación:** M (1-4h) si se resuelve derivándolo en los route handlers (5 archivos, cambio mecánico); L (> 4h) si se decide blindarlo a nivel DB con constraint/trigger en las 6 tablas.

---

### 7.3 `UNIQUE(user_id, location_id)` + rol por-location vs rol global — 🔺 DECISIÓN DE TANO

El constraint (`20260705000002_memberships_unique_location.sql:21`) es `UNIQUE (user_id, location_id)`, **no** `UNIQUE (user_id)`. El schema ya permite — y con el primer N=2 de Tano en STG, ya existe — un usuario con rol distinto en cada local: `owner` en Local A, `staff` en Local B, por ejemplo.

**¿El código actual hace alguna unión de roles?** No, verificado:
```
grep -rn "memberships\.some|memberships\.every|memberships\.map|memberships\.filter" app/ providers/ hooks/ lib/
  → único resultado: role-select/page.tsx:575 memberships.map(m => ...) — es el render de las cards
    para elegir membership, no un cálculo de permisos.
```
`canAccessModule(role: Role | undefined, module: ModuleKey)` (`app/role-select/page.tsx`) toma UN rol, no un array. `WRITE_ROLES.includes(role)` en todos lados también opera sobre el rol de la `activeMembership` actual, nunca sobre el conjunto de memberships del usuario. **Hoy no hay ninguna unión — el modelo vigente es estrictamente "un rol a la vez, el de la location activa."**

**🔺 DECISIÓN DE TANO:** ¿el rol de un usuario es una propiedad del usuario (global, el mismo en todos sus locales) o una propiedad de cada membership (por-location, como el schema ya permite)? No propongo la respuesta — documento lo que implica cada una para el diseño de P0.1:

- **Si es por-location (lo que el schema ya soporta hoy sin cambios):** `canAccessModule`/`lib/authz.ts` deben seguir recibiendo UN rol (el de la `activeMembership` actual), y cualquier gate — incluido `proxy.ts` (A-02) — necesita saber CUÁL location está activa, no solo cuál rol tiene el usuario "en algún lado". Es más código (hay que propagar `location_id` junto con `role` en cada chequeo), pero es coherente con lo que la `UNIQUE` ya permite y con cómo se comporta el sistema hoy.
- **Si es global (un usuario = un rol, sin importar el local):** hay que decidir QUÉ rol gana cuando el usuario tiene roles distintos en distintos locales (¿el más permisivo? ¿el de la primera membership creada? — mismo problema de "cuál gana" que A-01 ya identificó para elegir `activeMembership` por defecto) y agregar esa resolución en algún punto central. Es menos código de gating por-request, pero contradice lo que el schema ya modela (`UNIQUE(user_id, location_id)` con `role` en esa misma fila, no en una tabla `users` separada) — habría que preguntarse por qué el rol vive en `memberships` y no en `profiles` si en definitiva es global al usuario.

Cualquiera de las dos es válida como decisión de producto — lo que no es válido es que P0.1 se diseñe SIN definir esto primero, porque un `canAccessModule(roles: Role[], modulo)` "por unión" (mencionado como el diseño bajo consideración) le daría a un usuario `owner`-en-A + `staff`-en-B permisos de `owner` también en B, silenciosamente, el día que exista ese usuario — que es HOY en STG (el caso que Tano acaba de crear a mano).

---

### 7.4 `orgs` vs `organizations` — revisado, SIN drift real

```
grep -rn "\borgs\b" **/*.ts **/*.tsx **/*.sql **/*.md
```
4 resultados fuera de este mismo documento:
- `supabase/migrations/20260630000001_rls_complete_multitenant.sql:24` — `DROP POLICY IF EXISTS "Members can view their orgs" ON public.organizations;` — es el NOMBRE (string) de una policy vieja que la misma migración borra y reemplaza por `organizations_select_own`. No es una referencia a una tabla `orgs` — la tabla ya era `organizations` en ese DROP. Cosmético, ya limpiado en el propio commit.
- `docs/GUIA-OPERATIVA-AMBIENTES.md:158`, `docs/EVALUACION-ROBUSTEZ-Y-PROFESIONALISMO.md:18-19`, `docs/ANALISIS-ESTRUCTURA-Y-MEJORAS.md:101` — todos prosa usando "orgs" como abreviatura coloquial de "organizations" en una oración, no una referencia a un identificador de código.

**Conclusión:** no hay tabla, columna, tipo TS, ni variable llamada `orgs` en ningún lugar del código vigente — la tabla es consistentemente `organizations`, la columna es consistentemente `org_id`, el tipo TS es `Organization`. Reviso y reporto esto como negativo (chequeado, sin hallazgo) en vez de omitirlo, tal como pediste.

---

*Documento generado para P0.3. Alimenta P0.1 (`lib/authz.ts`) y es prerequisito de Sprint F (super-admin). Addendum agregado el mismo día tras recibir los números reales de cardinalidad y 4 puntos adicionales a analizar.*
