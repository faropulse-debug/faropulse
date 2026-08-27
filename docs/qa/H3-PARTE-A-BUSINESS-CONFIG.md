# H3 Parte A — location_business_config

Fecha: 2026-08-26. Rama `feature/h3-business-config` (worktree aislado, ver nota
de proceso al final). Migración: `supabase/migrations/20260826000001_location_business_config.sql`.

## Por qué

`AlertasSection.tsx:222` tenía una inversión ($210M) y un benchmark laboral (30%)
hardcodeados en React. Con un segundo restaurante las alertas mienten. Esta parte
crea el almacenamiento server-side para que esos números sean configurables por
location, y expone lectura/escritura. **No toca la UI** — eso es Parte B (Codex).

## Auditoría — el problema es 4x más grande que la línea 222

Grep sistemático de constantes de negocio hardcodeadas en componentes de
alertas/KPIs/proyección. Resultado: **12 valores en 5 archivos**, no 1 en 1.

| # | Archivo | Constante | Valor | Unidad |
|---|---|---|---|---|
| 1 | `AlertasSection.tsx:253` | `INVERSION` | `210_000_000` | pesos ARS |
| 2 | `AlertasSection.tsx:215,222` | benchmark laboral | `30` | % |
| 3 | `AlertasSection.tsx:192-194` | umbral CV% saludable | `37` | % |
| 4 | `AlertasSection.tsx:192-194` | umbral CV% elevado | `40` | % |
| 5 | `ProyeccionEjecutivaChart.tsx:42` | `INVERSION` | `210` (millones) | **duplicado de #1, otra escala** |
| 6 | `ProyeccionEjecutivaChart.tsx:51` | `COMENSALES_POR_DIA` | `[35,20,20,35,60,110,140]` | comensales/día (array de 7) |
| 7 | `ProyeccionEjecutivaChart.tsx:53` | `INFLACION_MENSUAL` | `0.015` | ratio/mes |
| 8 | `ProyeccionEjecutivaChart.tsx:54` | `DELIVERY_PCT` | `0.08` | ratio |
| 9 | `ProyeccionEjecutivaChart.tsx:55` | `CV_PCT` | `0.34` | ratio |
| 10 | `ProyeccionEjecutivaChart.tsx:56` | `CF_CRECIMIENTO` | `0.025` | ratio/mes |
| 11 | `ProyeccionEjecutivaChart.tsx:57` | `REGALIAS_PCT` | `0.05` | ratio |
| 12 | `ProyeccionEjecutivaChart.tsx:58` | `DIC_ESTACIONAL` | `0.30` | ratio |
| — | `PEDiarioChart.tsx:124`, `PEEvolutivoChart.tsx:113`, `PESemanalChart.tsx:132` | margen objetivo | `0.15` | ratio — **triplicado idéntico en 3 archivos** |

El margen `0.15` de Punto de Equilibrio cuenta como el mismo concepto que la key
`mc_objetivo_pct` (#13 de la lista de diseño) — no es un valor nuevo, es el
mismo hallazgo contado una vez.

Zona gris, fuera de alcance (confirmado con Tano): `EstadoNegocioSection.tsx`
(`magnitude<=7/<=15`, breakpoint editorial de tono narrativo) y
`MixCanalesChart.tsx` (`RECENT_MONTHS=6`, ventana de análisis). Ninguno es un
supuesto de negocio del restaurante.

## Diseño implementado

Tabla clave/valor (no columnas) — una columna por concepto no soporta
`COMENSALES_POR_DIA` (array de 7) y obliga a una migración por cada número nuevo:

```
location_id  uuid NOT NULL REFERENCES locations(id) ON DELETE CASCADE
key          text NOT NULL
value        jsonb NOT NULL
unit         text NOT NULL   -- 'ARS' | 'pct' | 'ratio' | 'comensales_dia'
updated_at   timestamptz NOT NULL DEFAULT now()
updated_by   uuid REFERENCES auth.users(id)
PRIMARY KEY (location_id, key)
```

**Fila ausente = no configurado.** Sin DEFAULT de negocio en ninguna columna.

Diseñado para los 12 valores; **implementados 5** (Parte A). Los otros 7 del
modelo de proyección quedan para Parte A.2 y necesitan su propia migración
(ALTER del CHECK) + su propia entrada en `lib/business-config.ts`.

### Las 5 claves de Parte A

| Key | Unit | Escala | Reemplaza |
|---|---|---|---|
| `inversion_ars` | `ARS` | pesos | `INVERSION` en AlertasSection.tsx **y** ProyeccionEjecutivaChart.tsx (fila única — Parte A.2 hace que Proyección lea de acá en vez de su copia en millones) |
| `benchmark_laboral_pct` | `pct` | 0-100 | `lastCL > 30` |
| `cv_umbral_saludable_pct` | `pct` | 0-100 | `lastCV < 37` |
| `cv_umbral_elevado_pct` | `pct` | 0-100 | `lastCV < 40` |
| `mc_objetivo_pct` | `ratio` | **0-1**, no 0-100 | `mc - 0.15` en los 3 charts de PE |

⚠️ `mc_objetivo_pct` guarda **0.15**, no 15, pese al sufijo `_pct` del nombre —
coincide 1:1 con el operando que reemplaza. Ver `lib/business-config.ts` para
el resto de las convenciones de escala.

### Defensa en profundidad (no solo una capa)

- **DB**: `location_business_config_key_unit_check` ata cada `key` a su `unit`
  correcta (typo no crea fila fantasma). `location_business_config_value_shape_check`
  valida tipo jsonb + rango numérico básico por unit.
- **RLS**: `user_has_membership()` para SELECT (cualquier rol con membership
  activa). `user_has_write_role()` — función nueva, espejo SQL de
  `lib/authz.ts WRITE_ROLES` — para INSERT/UPDATE.
- **App**: `/api/business-config` usa `requireMembership(..., { roles: WRITE_ROLES })`
  antes de escribir vía `service_role`, más validación de forma completa
  (`lib/business-config.ts`, rango real por unidad).

Ninguna de las tres capas depende de las otras dos para ser correcta — si una
falla, las otras siguen bloqueando. Motivo: 7 RPCs de este mismo sprint quedaron
con un patrón de autorización que filtraba entre locations del mismo org: no se
repite acá confiando en una sola capa.

### Sync forzado por test, no por disciplina

`tests/business-config-registry.test.ts` parsea la migración SQL y compara:
- Las 5 (key, unit) del CHECK == las 5 entradas de `BUSINESS_CONFIG_KEYS` (TS).
- La lista de roles de `user_has_write_role` (SQL) == `WRITE_ROLES` (TS).

Si alguien edita un lado sin el otro, el test rompe el build. Este es el
mecanismo que reemplaza "acordarse de actualizar las dos listas".

## Contrato para Codex (Parte B)

**Lectura** — RPC `get_location_business_config(p_location_id uuid)`, llamada
directo desde el cliente vía `supabase.rpc(...)` (mismo patrón que
`get_ventas_por_dia_semana`, `get_descuentos_resumen`, etc. — no pasa por un
route handler de Next).

Devuelve `{ key, value, unit, updated_at }[]` — **solo filas configuradas**.

> **Una key ausente del array de resultado significa "no configurado".**
> `null`/`undefined` ≠ `0`. NUNCA rellenar una key ausente con 0, ni con
> ningún otro default, en el código de consumo (AlertasSection.tsx y
> ProyeccionEjecutivaChart.tsx). Si `benchmark_laboral_pct` no viene en el
> array, la UI tiene que mostrar un estado "configurá este valor", no `0%`
> ni el número viejo hardcodeado.

Usar `toBusinessConfigLookup(rows)` de `lib/business-config.ts` para convertir
el array en un objeto tipado por key — ya implementa esa distinción
ausente-vs-configurado y descarta silenciosamente keys desconocidas (deriva
DB/registro).

**Escritura** — `POST /api/business-config?location_id=<uuid>`, body
`{ entries: [{ key, value }, ...] }`. Gateado a `WRITE_ROLES` (owner,
super_admin) — un `manager`/`encargado`/`staff` recibe 403. Todo-o-nada: si
una entrada del batch es inválida, no se escribe ninguna.

**Claves válidas hoy** (Parte A): `inversion_ars`, `benchmark_laboral_pct`,
`cv_umbral_saludable_pct`, `cv_umbral_elevado_pct`, `mc_objetivo_pct`. Rangos
y unidades en `BUSINESS_CONFIG_KEYS` (`lib/business-config.ts`) — es la fuente
de verdad, no hardcodear los rangos de nuevo en un componente.

## Verificación en STG — sesión autenticada real

⚠️ **No se usó `service_role` para verificar.** Con el gate
`user_has_membership`/`user_has_write_role`, `service_role` devuelve **vacío**
en vez de error — un script con service_role daría falso positivo. Se usó
login real (`/auth/v1/token?grant_type=password`) con las cuentas QA de STG y,
para la escritura, el route handler real (`next dev` apuntando a STG,
`scripts/verify-business-config-stg.ts`).

```
Verificación H3 Parte A — location_business_config — STG
  ✓  login qa-owner
  ✓  login qa-manager
  ✓  Caso 1 — sin config: RPC devuelve 0 filas (no una fila con value=0)
  ✓  Caso 2 — qa-owner escribe benchmark_laboral_pct=32 en su location
  ✓  Caso 2 — la lectura posterior devuelve exactamente el valor escrito (32), tipado number
  ✓  Caso 3 — qa-manager NO puede escribir (rol fuera de WRITE_ROLES)
  ✓  Bonus — qa-owner NO puede escribir en Sucursal Norte (ahí es encargado, no owner)

7/7 passed
```

- **Caso 1**: `qa-owner` (owner en Demo Ituzaingó, `bbbbbbbb-...0001`) sin config
  previa → la RPC devuelve 0 filas para `benchmark_laboral_pct`, no una fila
  con `value: 0`. Confirmado antes de escribir nada.
- **Caso 2**: `qa-owner` escribe `benchmark_laboral_pct: 32` vía
  `/api/business-config` → 200. Lectura posterior vía RPC devuelve
  `{ value: 32, unit: 'pct' }` exacto.
- **Caso 3**: `qa-manager` (mismo location, rol `manager`) intenta el mismo
  write → 403. `WRITE_ROLES` rechaza en la capa de app antes de tocar la DB.
- **Bonus**: `qa-owner` tiene DOS memberships reales en STG —
  `owner` en Demo Ituzaingó y `encargado` en "QA Multi - Sucursal Norte"
  (`f203a8fe-fc04-40d8-bc08-3c7571b4c008`). Intentó escribir en Sucursal
  Norte (donde es `encargado`, no `owner`) → **403, correctamente rechazado**.
  No es la misma clase de bug que P0-B — `requireMembership` resuelve el rol
  por `(user_id, location_id)` de la request, no por una sesión/cookie global,
  así que el rol de una location no contamina la autorización en otra.

Dato de prueba (`benchmark_laboral_pct=32` en Demo Ituzaingó) borrado después
de verificar, para no interferir con el testing de Codex en Parte B — STG
quedó en 0 filas en `location_business_config`.

## Nota de proceso — worktree aislado

El directorio compartido (`C:\Users\straz\faro-app`) tenía trabajo sin
commitear de otra tarea (QA lint) en la rama activa. Siguiendo el incidente de
directorio compartido reportado, este trabajo se hizo en un worktree aislado
(`C:\Users\straz\faro-app-h3-business-config`, rama `feature/h3-business-config`
desde `origin/develop`) para no pisarlo. Acordado con Tano: worktree aislado
por tarea de acá en adelante.

## 🔺 Para Tano — ProyeccionEjecutivaChart es más grave que las alertas

`ProyeccionEjecutivaChart.tsx` (sección "Proyección Ejecutiva", visible al
cliente) construye una proyección financiera a futuro sobre **8 supuestos
inventados** (`INVERSION`, `COMENSALES_POR_DIA`, `INFLACION_MENSUAL`,
`DELIVERY_PCT`, `CV_PCT`, `CF_CRECIMIENTO`, `REGALIAS_PCT`, `DIC_ESTACIONAL`).
Una alerta con un umbral flojo es una alerta imprecisa; una proyección con
supuestos inventados es una afirmación sobre el futuro del negocio del
cliente sin ninguna base real.

Qué mostraría el componente hoy si esos 7 supuestos (todo salvo la inversión,
que Parte A ya resuelve) **no estuvieran configurados**, tal como está escrito
el código ahora mismo: nada distinto de lo que muestra hoy — `buildProjections()`
no tiene ninguna rama de "supuesto ausente", los usa directamente como
literales de módulo. No hay manera de que el componente actual detecte
"no tengo suficiente base para proyectar" — siempre proyecta, con los mismos
8 números, para cualquier location.

Esto es insumo para la decisión de Parte A.2, no una resolución: la respuesta
correcta podría no ser "agregar un formulario para configurar 7 números más"
sino "no mostrar el módulo de proyección hasta que haya suficiente historial
real para derivar esos supuestos de los datos de la location (o para no
mostrar una cifra que suene a compromiso del negocio)". Recomiendo decidir eso
antes de escribir la migración de A.2, no después.
