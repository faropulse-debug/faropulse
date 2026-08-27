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
