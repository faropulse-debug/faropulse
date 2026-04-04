# Evaluación: robustez y profesionalismo del proyecto FARO-APP

Análisis enfocado en qué tan sólido y “de producción” se ve el proyecto y qué le falta para estar a nivel profesional.

---

## 1. Cómo se ve hoy (resumen)

**En conjunto:** El proyecto está **bien encaminado** para un producto interno o MVP: estructura clara, auth con roles, RLS en Supabase, componentes extraídos y flujo de datos definido. Para un **producto comercial o equipo externo** aún faltan piezas típicas de proyectos profesionales: validación de entorno, documentación propia del producto, tests, manejo de errores global, y quitar logs de depuración en código de producción.

---

## 2. Lo que está bien (robusto / profesional)

| Área | Qué hay | Por qué suma |
|------|---------|--------------|
| **Auth** | Sesión validada en servidor (`getUser()` en middleware), cookie de rol, rutas protegidas por rol. | No se confía solo en el cliente; el middleware corta acceso sin sesión válida. |
| **Seguridad en datos** | RLS en tablas de datos (migración con `user_has_membership`), RPCs con `EXISTS` contra `memberships`. | Doble capa: RLS en tablas y validación en funciones; evita acceso cruzado entre orgs/locations. |
| **Multi-tenant** | `locationId` / `orgId` desde membership activo, con fallback a env. | Permite múltiples orgs/locations sin hardcodear un solo local. |
| **Carga de datos** | Validación de esquema antes de insertar, detección de duplicados, preview, modo reemplazar/agregar, batches. | Reduce errores y da control al usuario antes de escribir en la BD. |
| **TypeScript** | `strict: true`, tipos en auth, hooks, RPCs y componentes. | Menos bugs en tiempo de desarrollo y mejor mantenimiento. |
| **Scripts** | `lint` y `typecheck` con alcance definido. | Se puede integrar en CI y mantener calidad de código. |
| **Migraciones** | RLS y constraints en SQL versionado, políticas idempotentes. | Reproducible y documentado en el repo. |

---

## 3. Lo que le falta para verse más robusto y profesional

### 3.1 Configuración y entorno

| Falta | Impacto | Recomendación |
|-------|---------|----------------|
| **`.env.example`** | Quien clone el repo no sabe qué variables definir. | Archivo con `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_LOCATION_ID`, `NEXT_PUBLIC_ORG_ID` (y opcionalmente qué son). |
| **Validación de env al arranque** | Si faltan variables, falla en runtime de forma poco clara. | Validar en build o en un módulo que se cargue al inicio (p. ej. `lib/env.ts`) y lanzar un error explícito si falta algo crítico. |
| **README del producto** | El README es el genérico de Next.js. | Reemplazar o ampliar: qué es FAROPULSE, cómo correr (incl. variables de entorno), cómo hacer deploy, estructura del proyecto y dónde está la doc (p. ej. `docs/`). |

### 3.2 Errores y resiliencia

| Falta | Impacto | Recomendación |
|-------|---------|----------------|
| **Error boundary global** | Un error no capturado en un componente tira pantalla en blanco o error crudo. | Añadir `app/error.tsx` (y opcionalmente `app/global-error.tsx`) con mensaje amigable y opción de reintentar. |
| **Estados de error en dashboard** | Ya se muestra `dataError` en el header; no hay vista “solo error” con mensaje claro. | Opcional: cuando `dataError` y no hay datos, mostrar un bloque dedicado (“No se pudieron cargar los datos”, con botón refetch). |
| **Manejo de “sin location”** | Si el usuario no tiene `location_id` ni `org_id` en su membership, `locationId` queda vacío y se usan mocks sin explicación. | Mostrar un aviso en UI (“Seleccioná un local” o “Sin local asignado”) en lugar de depender solo de `console.warn`. |
| **Página 404** | No hay `app/not-found.tsx` personalizado. | Añadir una página 404 con estilo de la app y enlace a dashboard o login. |

### 3.3 Calidad de código y operación

| Falta | Impacto | Recomendación |
|-------|---------|----------------|
| **Logs en producción** | En `lib/processors/excelProcessor.ts` hay `console.log` / `console.warn` / `console.error` (primer batch, external_id nulos, errores de Supabase). | Quitar o envolver en un helper que solo loguee si `process.env.NODE_ENV === 'development'` (o usar una lib de logging). |
| **`console.warn` en useDashboardData** | Cuando `locationId` está vacío se hace `console.warn`. | Eliminar o reemplazar por estado/callback para mostrarlo en UI en lugar de en consola. |
| **Tests** | No hay tests. | Mínimo: tests unitarios para `lib/format.ts` y para la lógica de validación en `uploadValidator`. Opcional: tests de hooks con Supabase mockeado y e2e para login/dashboard. |

### 3.4 Consistencia entre backend y tipos

| Falta | Impacto | Recomendación |
|-------|---------|----------------|
| **RPCs vs esquema de `memberships`** | La migración RLS dice que **memberships no tiene `location_id`** y usa `user_has_membership(location_id)` que hace JOIN con `locations`. Las RPCs del dashboard usan `(m.location_id = p_location_id OR m.org_id = p_location_id)`. Si en la BD `memberships` no tiene columna `location_id`, esa condición puede ser incorrecta o redundante. | Verificar en la BD si `memberships` tiene `location_id`. Si no: unificar lógica de las RPCs con la de `user_has_membership` (JOIN `locations` y comprobar que la location pertenezca a la org del usuario). |

### 3.5 Experiencia y producto

| Falta | Impacto | Recomendación |
|-------|---------|----------------|
| **Loading explícito en dashboard** | Hay `dataLoading` y algo de opacidad; no hay skeleton o estado “Cargando…” claro. | Opcional: skeleton de tarjetas/gráficos o mensaje “Cargando datos…” mientras `isLoading`. |
| **Vista Manager** | Sigue siendo placeholder. | Cuando se implemente, reutilizar componentes del dashboard owner y misma lógica de permisos por location/org. |
| **Botón Exportar** | Deshabilitado con “Próximamente”. | Dejar así hasta implementarlo, o ocultarlo hasta que esté listo. |

### 3.6 DevOps y despliegue

| Falta | Impacto | Recomendación |
|-------|---------|----------------|
| **CI** | No hay pipeline (GitHub Actions, etc.) que ejecute `lint`, `typecheck` y (cuando existan) tests. | Añadir un workflow que corra al menos `npm run typecheck` y `npm run lint` en cada PR o push. |
| **Variables en deploy** | Depende de que quien despliegue configure bien las env. | Documentar en README (o en doc de deploy) las variables obligatorias y recomendadas. |

---

## 4. Resumen por nivel

- **Robusto (seguridad y datos):** Bien: auth en servidor, RLS, RPCs con validación, multi-tenant. Ajustar: alinear RPCs con el esquema real de `memberships`/`locations`.
- **Profesional (mantenibilidad y operación):** Falta: `.env.example`, README del producto, validación de env, quitar logs de prod, tests básicos, error boundary y 404 propio.
- **Experiencia de usuario:** Aceptable: errores de datos y login visibles. Mejoraría: estado “sin location”, loading/skeleton y 404 amigable.

En conjunto: **el proyecto es sólido en auth y permisos**, y tiene **buena base de código**. Para acercarlo más a un estándar **robusto y profesional**, lo más impactante sería: **documentación y env (README + .env.example + validación)**, **limpieza de logs** en código de producción, **error boundary y 404**, y **revisar la lógica de permisos en las RPCs** frente al esquema real de la BD.
