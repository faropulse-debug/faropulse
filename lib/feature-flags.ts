/**
 * Feature flags for optional integrations that are off by default but kept
 * in the codebase for a possible future re-activation (not deleted).
 */

/**
 * Direct integration with the CucinaGo API (order/item sync + POS reconciliation).
 * Archived 2026-07-31: CucinaGo's API is currently broken (555 / ORDS-25001), it's
 * unused in production, and it was blocking CI — the routes below made real network
 * calls to a dead endpoint and timed out in tests. Flip to true only if there's a
 * renewed agreement with CucinaGo and the API is confirmed working again.
 *
 * Gates:
 *  - "Reconciliar vs CucinaGo" link (app/dashboard/owner/v2/page.tsx)
 *  - /dashboard/reconcile page
 *  - POST /api/upload/cucinago
 *  - POST /api/reconcile/cucinago
 *
 * The reconciliation concept itself (FARO vs POS) is NOT archived — see
 * src/lib/reconcile/compare.ts, which is source-agnostic and stays active.
 * Future path: reconcile against the Excel export instead of a live API call.
 */
export const CUCINAGO_INTEGRATION_ENABLED = false
