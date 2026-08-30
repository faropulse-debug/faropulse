/**
 * Marcadores sintéticos explícitamente sembrados en STG para validaciones determinísticas de QA.
 * 
 * REGLA: Los tests deben importar estas constantes por nombre en lugar de escribir
 * literales numéricos crudos en el código. Esto asegura "una definición, un lugar"
 * y permite al linter de aserciones (`audit-assertions`) diferenciar marcadores
 * deliberados de números mágicos frágiles sobre datos vivos.
 */

/** Fila sintética 1 de QA Tenant B (qa-b-owner) */
export const QA_TENANT_B_SYNTHETIC_1 = 555555.55;

/** Fila sintética 2 de QA Tenant B (qa-b-owner) */
export const QA_TENANT_B_SYNTHETIC_2 = 666666.66;

/** Fila sintética 3 de QA Tenant B (qa-b-owner) */
export const QA_TENANT_B_SYNTHETIC_3 = 777777.77;

/** Suma acumulada de las 3 filas sintéticas de QA Tenant B */
export const QA_TENANT_B_SYNTHETIC_SUM = 1999999.98;

/** Monto del Canario C-01 sembrado en financial_results de Sucursal Norte */
export const QA_CANARIO_C01_MONTO = 888888.88;

/**
 * documento_bruto() — casos sintéticos para el guard de reversos.
 * No hay notas de crédito con descuento=100 en datos reales de STG para
 * validar el guard (documento_peso() × ABS(bruto_items)) con dato vivo, así
 * que se prueba con parámetros sintéticos pasados directo a la función.
 */

/** Caso normal (sin reverso): bruto_items positivo, documento_peso=+1 → sale igual */
export const QA_DOCUMENTO_BRUTO_NORMAL_ESPERADO = 121212;

/**
 * Caso reverso: réplica del patrón real de la única Nota de Crédito de STG,
 * donde cantidad Y precio_unitario vienen negados (cantidad=-1,
 * precio_unitario=-64200), así que bruto_items=SUM(cantidad*precio_unitario)
 * da +64200 (positivo) aunque el total sea -64200. El guard debe invertir el
 * signo vía documento_peso('Nota de Crédito Int. Venta', ...) = -1.
 */
export const QA_DOCUMENTO_BRUTO_REVERSO_ESPERADO = -64200;
