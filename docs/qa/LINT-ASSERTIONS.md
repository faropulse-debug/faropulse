# Linter de Aserciones Frágiles (`audit-assertions`)

## 1. Motivación y Contexto

En tests de integración y validaciones contra bases de datos vivas (como Staging o Producción), comparar resultados contra **literales numéricos fijos** (números mágicos como `toBe(410)` o `toEqual(363.5)`) es un anti-patrón crítico porque **vence solo**.

Cuando se cargan nuevos datos de negocio o se ejecuta un backfill (por ejemplo, sumando ventas de días recientes), el número total de registros cambia naturalmente. Si el test tenía hardcodeado `expect(total).toBe(410)`, el test fallará en rojo. Este falso negativo no indica un bug de software, sino simplemente que los datos evolucionaron. Cuando el equipo se acostumbra a ver tests en rojo que "no significan nada", se pierde la confianza en la suite de CI y se tiende a ignorar alertas legítimas.

---

## 2. Definición de Reglas: ¿Qué es Frágil vs No Frágil?

### 🔴 FRÁGIL (Bloqueado por el Linter)
Cualquier comparación de igualdad estricta (`.toBe()`, `.toEqual()`, `.toStrictEqual()`, `assert(===)`) que contraste el resultado de una consulta sobre datos vivos contra una constante numérica hardcodeada dependiente del volumen de la base.

**Ejemplos Frágiles:**
```ts
// ❌ MAL: Depende de cuántos tickets había en julio al momento de escribir el test
expect(data.length).toBe(410);

// ❌ MAL: La suma de ventas viva cambia con cada comanda nueva
expect(totalFacturado).toBe(363.5);

// ❌ MAL: Conteo dependiente de datos vivos
expect(rows[0].ventas).toEqual(1999999.98);

// ❌ MAL: Assert directo contra conteo vivo
assert(count === 150, 'deben ser 150');
```

**Sugerencia de corrección:**
- Validar **invariantes relacionales**: comparar la sumatoria de una RPC contra la sumatoria de otra RPC en el mismo período (ej. `expect(totalDaily).toBe(netoMensual)`).
- Validar **desigualdades o cotas**: `expect(data.length).toBeGreaterThan(0)`.
- Validar **propiedades de estructura**: `expect(rows).toBeInstanceOf(Array)`.

---

### 🟢 NO FRÁGIL (Permitido por el Linter)

El linter incluye una allowlist inteligente para evitar falsos positivos en verificaciones legítimas:

1. **Códigos de Estado HTTP:**
   - Protocolos y contratos de red: `toBe(200)`, `toBe(201)`, `toBe(204)`, `toBe(307)`, `toBe(400)`, `toBe(401)`, `toBe(403)`, `toBe(404)`, `toBe(422)`, `toBe(500)`.
   - *Ejemplo:* `expect(res.status).toBe(403);`

2. **Constantes Estructurales e Invariantes Básicos (0, 1, -1):**
   - Comprobación de colecciones vacías o diferencias nulas: `toBe(0)`, `toHaveLength(0)`.
   - Signos y multiplicadores de dominio: `documento_peso` devuelve `1` o `-1`.
   - *Ejemplo:* `expect(emptyList.length).toBe(0);`
   - *Ejemplo:* `expect(documento_peso('Nota de Crédito', 100)).toBe(-1);`

3. **Marcadores Sintéticos Deliberados (Canarios y Fixtures de QA):**
   - Valores sintéticos explícitamente sembrados en la base de datos para pruebas que nunca cambian con el tráfico de usuarios reales:
     - `555555.55`, `666666.66`, `777777.77` (QA Tenant B)
     - `888888.88` (Canario C-01 de P&L)
     - `1999999.98` (Total sintético de Tenant B)
   - *Ejemplo:* `expect(canarioRow.monto).toBe(888888.88);`

4. **Invariantes Relacionales entre Variables:**
   - *Ejemplo:* `expect(totalDaily).toBe(netoMensual);`

5. **Tests Puramente Unitarios con Fixtures Locales:**
   - Archivos de tests en memoria donde los datos se definen explícitamente en el propio archivo (sin llamadas a Supabase ni fetch a servidores vivos).
   - *Ejemplo:* `const FIXTURE = [{ pedidos: 10 }]; expect(calc(FIXTURE)).toBe(10);`

---

## 3. Arquitectura del Linter

El linter sigue una arquitectura en capas desacopladas:

1. **Motor Puro (`scripts/lib/assertion-engine.ts`):**
   - Analiza el código fuente utilizando el árbol de sintaxis abstracta (AST) de TypeScript (`ts.createSourceFile`).
   - Identifica nodos de llamadas a `expect().toBe()`, `toEqual()`, `toStrictEqual()` y `assert(===)`.
   - Totalmente independiente de I/O de disco y evaluado mediante tests unitarios en `tests/assertion-engine.test.ts`.

2. **Capa Ejecutora / CLI (`scripts/audit-assertions.ts`):**
   - Recorre los directorios `tests/` y `scripts/`.
   - Aplica el motor sobre cada archivo de integración.
   - Modos de ejecución:
     - `--mode=ci`: Finaliza con código de salida `1` si detecta aserciones frágiles.
     - `--mode=report`: Lista los hallazgos y sugerencias finalizando con código de salida `0`.

---

## 4. Uso

### Ejecución Local
```bash
# Modo verificación (bloqueante si hay errores)
npx tsx scripts/audit-assertions.ts --mode=ci

# Modo reporte informativo
npx tsx scripts/audit-assertions.ts --mode=report
```

### Integración en CI
Integrado en el pipeline `.github/workflows/ci.yml` en cada Pull Request para evitar regresiones de aserciones frágiles antes del merge a `develop`.
