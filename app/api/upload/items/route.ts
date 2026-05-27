import { NextRequest, NextResponse } from 'next/server'
import {
  ABORT_THRESHOLD,
  type SvcHeaders,
  validateFileIdentity,
  parseItems,
  insertItems,
  queryFreshness,
  buildRejectionReasons,
} from '@/src/lib/upload/helpers'

const mask = (s: string) => s.slice(0, 10) + '***'

export async function POST(req: NextRequest) {
  const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supaKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const missingVars: string[] = []
  if (!supaUrl) missingVars.push('NEXT_PUBLIC_SUPABASE_URL')
  if (!supaKey) missingVars.push('SUPABASE_SERVICE_ROLE_KEY')
  if (missingVars.length > 0) {
    console.error('[upload/items] missing env vars:', missingVars.join(', '))
    return NextResponse.json({
      error:       'Configuración faltante',
      details:     missingVars.map(v => `Variable ${v} no está definida en el ambiente. Configurar en Vercel Settings → Environment Variables`).join(' '),
      missingVars,
    }, { status: 500 })
  }
  console.log(`[upload/items] env: url=${mask(supaUrl!)} key=${mask(supaKey!)}`)

  const svc: SvcHeaders = {
    'Content-Type':  'application/json',
    'apikey':        supaKey!,
    'Authorization': `Bearer ${supaKey}`,
    'Prefer':        'return=minimal',
  }

  try {
    const form       = await req.formData()
    const itemsFile  = form.get('items')       as File   | null
    const locationId = form.get('location_id') as string | null
    const orgId      = form.get('org_id')      as string | null

    // 'ventas' is intentionally ignored — this endpoint is items-only
    console.log(`[upload/items] location_id=${locationId} org_id=${orgId} itemsFile=${itemsFile?.name ?? 'none'}`)

    if (!locationId || !orgId) {
      return NextResponse.json({ error: 'Faltan location_id u org_id' }, { status: 400 })
    }
    if (!itemsFile) {
      return NextResponse.json({ error: 'Se requiere el archivo items' }, { status: 400 })
    }

    // ── Phase 0: File identity — extension, magic bytes, required columns ─────
    const identity = await validateFileIdentity(itemsFile, 'items')
    if (!identity.ok) {
      console.warn(`[upload/items] FILE_IDENTITY_FAILED: ${identity.message}`)
      return NextResponse.json({
        success:  false,
        error:    'FILE_IDENTITY_FAILED',
        message:  identity.message,
        expected: identity.expected,
        received: identity.received,
        missing:  identity.missing,
        extra:    identity.extra,
      }, { status: 422 })
    }

    // ── Phase 1: Parse + validate (no DB) ─────────────────────────────────────
    const parsed = parseItems(await itemsFile.arrayBuffer(), orgId, locationId)
    console.log(`[upload/items] parsed: processed=${parsed.processed} valid=${parsed.valid.length} rejected=${parsed.rejected} rejectedPct=${(parsed.rejectedPct * 100).toFixed(1)}%`)

    // ── Phase 2: 5% abort check — bail before touching DB ────────────────────
    if (parsed.rejectedPct > ABORT_THRESHOLD) {
      const abortDetails = [{
        file:        'items',
        rejectedPct: +(parsed.rejectedPct * 100).toFixed(1),
        reasons:     buildRejectionReasons(parsed.reasons),
      }]
      console.warn(`[upload/items] ABORT: rechazo supera ${ABORT_THRESHOLD * 100}%`, JSON.stringify(abortDetails))
      return NextResponse.json({
        success:     false,
        abortReason: `Más del ${ABORT_THRESHOLD * 100}% de filas son inválidas. No se insertó nada.`,
        abortDetails,
      }, { status: 422 })
    }

    // ── Phase 3: DB operations ────────────────────────────────────────────────
    const result = await insertItems(parsed, locationId, supaUrl!, svc)
    console.log(`[upload/items] insertItems: inserted=${result.inserted} deleted=${result.deleted} failed=${result.failed} new=${result.new} updated=${result.updated}`)

    // ── Phase 4: Freshness ────────────────────────────────────────────────────
    const fresh = await queryFreshness(locationId, supaUrl!, svc)

    // ── Phase 5: Computed validations ─────────────────────────────────────────
    const fechaCajaCompleteness = parsed.processed > 0
      ? +(parsed.fechaCajaCount / parsed.processed * 100).toFixed(1)
      : 0

    // ── Phase 6: Summary string ────────────────────────────────────────────────
    const summary = result.processed > 0
      ? `${result.inserted} ítems (${result.new} nuevos, ${result.updated} actualizados)`
      : 'Sin datos procesados'

    return NextResponse.json({
      success: true,
      summary,

      items: {
        processed:        result.processed,
        new:              result.new,
        updated:          result.updated,
        rejected:         result.rejected,
        rejectionReasons: result.rejectionReasons,
      },
      validations: {
        fechaCajaCompleteness,
      },
      freshness: {
        lastUpload: fresh.lastUpload ?? new Date().toISOString(),
        datasets: {
          sales_items: fresh.datasets['sales_items'] ?? null,
        },
      },

      // ── Flat fields (backward compat, mirrors sales endpoint shape) ────────
      itemsInserted: result.inserted,
      itemsDeleted:  result.deleted,
      itemsFailed:   result.failed,
      dateRange:     result.dateFrom ? `${result.dateFrom} – ${result.dateTo}` : '',
      errors:        result.errors,
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[upload/items] error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
