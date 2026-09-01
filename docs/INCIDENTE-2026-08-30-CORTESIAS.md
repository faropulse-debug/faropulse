# Incidente 2026-08-30 — carga manual de detalle-gap-cortesias.xlsx

**Fecha del incidente:** 2026-08-30 · **Documentado:** 2026-09-01 · **Alcance:** solo documentación — ningún cambio de código ni de datos derivado de este documento. El fix de causa raíz (propagar el actor a `upload_events`) va en un PR de código aparte.

**Resumen en una línea:** el 2026-08-30 a las 15:48 UTC se subió a mano un archivo (`detalle-gap-cortesias.xlsx`, 11 filas) que completó `sales_items` para 3 tickets con descuento=100 que ya existían desde junio de 2026 sin items. Las 11 filas son correctas y coinciden con PROD — quedan. El actor que las subió no se pudo identificar: quedó acotado a 2 cuentas sin poder distinguir cuál, porque la causa raíz de este mismo incidente (`userId` resuelto y descartado, ver §4 más abajo) hizo que `upload_events` no tuviera dónde guardarlo.

---

## 1. Línea de tiempo

| Cuándo | Qué |
|---|---|
| Junio 2026 | 3 tickets con `descuento = 100` (cortesías) quedan cargados en `sales_documents` sin filas correspondientes en `sales_items` — confirmado por separado en el footnote de la UI de Descuentos ("3 tickets quedaron fuera del total porque no tiene bruto cargado"). |
| 2026-08-30, 15:48 UTC | Se sube `detalle-gap-cortesias.xlsx` — 11 filas — vía el endpoint de upload. El archivo completa exactamente los items faltantes de esos 3 tickets. |
| 2026-08-30 (mismo día, después) | Tano detecta a mano, con dos queries SQL (una por ambiente), que esos 3 documentos con `descuento=100` en STG no tenían filas en `sales_items` aunque los mismos 3 sí las tenían en PROD — un hueco de ingesta de $89.700 en la suma de bruto derivado. Ese hallazgo manual es el origen de `scripts/invariante-stg-prod.ts` (PR #65 de este mismo sprint). |
| 2026-08-30/31 | Investigación forense: revisión de transcripts de los dos agentes con acceso a STG en ese momento (Antigravity, Codex) para descartar que la carga viniera de un agente en vez de una persona. |

---

## 2. Agentes descartados — con evidencia

Los dos agentes con acceso a STG en la ventana del incidente quedaron descartados, cada uno con transcript completo revisado:

- **Antigravity:** 39 comandos ejecutados en la sesión activa alrededor del incidente, ninguno es un upload. El agente estaba corriendo QA visual (screenshots de Playwright, ver `verify-june-courtesy-footnote.ts` en el histórico de trabajo — de hecho es el que originalmente documentó el footnote de "3 tickets sin bruto" en junio), no cargas de datos.
- **Codex:** 81 tool calls en la ventana relevante, ninguna es una mutación de datos (ni upload, ni INSERT/UPDATE directo). Trabajo de solo lectura/análisis.

Ambos transcripts completos están disponibles como evidencia si hace falta re-auditar.

## 3. El actor no se pudo identificar

Descartados los agentes, la carga fue humana. Los logs de acceso a STG en la ventana del incidente acotan el universo a **2 cuentas**: `owner@demo.com` y `qa-owner@faropulse.test`. No hay forma de distinguir cuál de las dos ejecutó el upload — ninguna fuente de datos disponible (ver Causa raíz, §4) registra el actor de un evento de upload.

## 4. Causa raíz

`app/api/upload/[contract_id]/route.ts` (y los otros dos endpoints que corren el mismo pipeline, `/api/upload/sales` y `/api/upload/items`) llaman a `requireMembership()`, que **sí** resuelve el `userId` del caller autenticado:

```ts
const authResult = await requireMembership(req, locationId, { roles: WRITE_ROLES })
if (authResult instanceof Response) return authResult
// userId nunca se usa de acá en adelante
```

La variable se descartaba en la línea siguiente a la verificación de membership — nunca llegaba a `recordEvent()`. Y aunque hubiera llegado, `upload_events` (la tabla de audit trail append-only de cada upload) no tenía ninguna columna para guardarla. Consecuencia directa: se tuvo el evento de upload completo — timestamp, contrato, archivo, resultado — pero ninguna forma de saber quién lo disparó.

Este es exactamente el patrón que impidió acotar el actor a una sola cuenta en este incidente. El fix (migración aditiva `actor_user_id` en `upload_events` + propagación del `userId` ya resuelto por `requireMembership()` hasta `recordEvent()`) va en un PR de código separado de este (Tarea C del sprint de higiene, rama `fix/upload-events-actor`). Este documento es solo el registro del incidente — no incluye el fix.

## 5. Decisión: las 11 filas se quedan

Las 11 filas cargadas por `detalle-gap-cortesias.xlsx` **no se revierten**. Motivos:

1. **Son correctas.** Completan exactamente los items de los 3 tickets que tenían el hueco — no hay discrepancia de contenido, solo de trazabilidad de quién las cargó.
2. **Coinciden con PROD.** El propio hallazgo que originó la investigación fue que PROD ya tenía esas filas y STG no — la carga alineó STG con el estado correcto conocido en PROD, no lo desvió.
3. **Son lo único que da bruto > 0 en esos 3 tickets.** Sin esas 11 filas, los 3 tickets vuelven a quedar con `bruto` no derivable (el fallback de `documento_bruto()` sin items solo cubre `descuento=0` y `0<descuento<100` — con `descuento=100` sin items da `NULL`, no un valor sustituible). Revertir la carga no vuelve al "estado anterior conocido", vuelve a un estado peor que el que motivó la investigación.

No se pudo identificar el actor, pero identificar el actor y validar el contenido de la carga son dos preguntas independientes — la segunda tiene respuesta clara y es la que determina si los datos se quedan.

---

## 6. Deudas del incidente — APARCADAS HASTA FASE F (decisión de Tano)

Ninguno de los siguientes puntos tiene acción tomada. Quedan documentados por decisión explícita de Tano de no tocar credenciales ni tema-adyacentes hasta Fase F. Este PR es solo el registro.

- **Secretos de PROD en OneDrive sincronizado.** `.env.staging` (nombre del archivo, no de lo que contiene) tiene un PAT que alcanza PROD — confirmado que apunta a `lahnngwyfbejgesulafr`. El archivo vive en una carpeta sincronizada por OneDrive, junto con `service_role` + access token de PROD.
- **Retención de audit logs de 1 día (plan Free de Supabase).** Marzo 2026 es inconsultable — cualquier actividad de ese período (previo al incidente) ya no tiene rastro en los audit logs de la plataforma, más allá de lo que el propio esquema de la app (como `upload_events`) haya guardado.
- **El PAT es de CUENTA, no de proyecto.** Un access token pensado para trabajar contra STG (de ahí el nombre `.env.staging`) alcanza PROD igual, porque Supabase emite los Personal Access Tokens a nivel de cuenta de usuario, no de proyecto — no hay forma de emitir uno restringido a un solo proyecto.

### Cierres ya verificados por Tano (no son deuda, quedan documentados como resueltos)

- El token de OneDrive (`sbp_c467…`) está **muerto** — probado, devuelve 401.
- Tano es el **único miembro** de la organización de Supabase (no hay una cuenta adicional con acceso a auditar).
- **MFA activado** en la cuenta Owner (antes estaba deshabilitado).

---

## Referencias

- Script que originó la detección manual: `scripts/invariante-stg-prod.ts` (PR #65).
- Fix de causa raíz (propagación de `userId` a `upload_events.actor_user_id`): rama `fix/upload-events-actor` (PR #67).
- Memoria de proyecto: `project_faro_context`, `project_provision_membership`, `project_sprint2_backlog`.
