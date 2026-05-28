import { NextRequest, NextResponse } from 'next/server'
import { getContract, listContracts } from '@/src/lib/upload/contracts/registry'
import { recordEvent } from '@/src/lib/upload/pipeline/recordEvent'
import { buildSvcHeaders } from '@/src/lib/upload/pipeline/types'
import { computeRequestHash } from '@/src/lib/upload/pipeline/computeRequestHash'
import { queryCommittedByRequestHash } from '@/src/lib/upload/pipeline/queryCommittedByRequestHash'
import { queryExistingHashes } from '@/src/lib/upload/pipeline/queryExistingHashes'
import { deleteByHashes } from '@/src/lib/upload/pipeline/deleteByHashes'
import { insertBatch } from '@/src/lib/upload/pipeline/insertBatch'

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ contract_id: string }> },
) {
  const { contract_id } = await ctx.params

  const contract = getContract(contract_id)
  if (!contract) {
    return NextResponse.json(
      { error: 'CONTRACT_NOT_FOUND', available: listContracts().map(c => c.id) },
      { status: 404 },
    )
  }

  const supaUrl    = process.env.NEXT_PUBLIC_SUPABASE_URL  ?? ''
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
  const svc        = buildSvcHeaders(serviceKey)

  let orgId:      string | null    = null
  let locationId: string | null    = null
  let eventId:    string | undefined

  try {
    const form = await req.formData()
    const file = form.get(contract.datasetType) as File | null
    orgId      = form.get('org_id')      as string | null
    locationId = form.get('location_id') as string | null

    if (!file) {
      return NextResponse.json(
        { error: 'MISSING_FILE', detail: `Expected form field: ${contract.datasetType}` },
        { status: 400 },
      )
    }
    if (!orgId) {
      return NextResponse.json({ error: 'MISSING_ORG_ID' }, { status: 400 })
    }
    if (!locationId) {
      return NextResponse.json({ error: 'MISSING_LOCATION_ID' }, { status: 400 })
    }

    const buffer      = await file.arrayBuffer()
    const requestHash = computeRequestHash(buffer)

    // ── upload.received ───────────────────────────────────────────────────────
    const received = await recordEvent(
      {
        eventType:  'upload.received',
        contractId: contract_id,
        orgId,
        locationId,
        payload: { requestHash, fileName: file.name, sourceType: contract.sourceType },
      },
      supaUrl,
      serviceKey,
    )
    eventId = received.event_id

    // ── idempotency short-circuit ─────────────────────────────────────────────
    const cached = await queryCommittedByRequestHash(requestHash, contract_id, locationId, supaUrl, svc)
    if (cached) {
      await recordEvent(
        { eventId, eventType: 'upload.duplicate_skipped', contractId: contract_id, orgId, locationId,
          payload: { requestHash, originalEventId: cached.event_id } },
        supaUrl, serviceKey,
      )
      const p = cached.payload
      return NextResponse.json({
        success:          true,
        event_id:         eventId,
        contract_id,
        request_hash:     requestHash,
        status:           'duplicate_skipped',
        original_event_id: cached.event_id,
        [contract.datasetType]: {
          processed: ((p.newCount as number) ?? 0) + ((p.updatedCount as number) ?? 0),
          new:       (p.newCount     as number) ?? 0,
          updated:   (p.updatedCount as number) ?? 0,
          rejected:  0,
          failed:    (p.failed       as number) ?? 0,
        },
        errors: [],
      })
    }

    const pctx   = { orgId, locationId, eventId }
    const source = { type: contract.sourceType, payload: file }

    // ── validate ──────────────────────────────────────────────────────────────
    const v = await contract.validate(source, pctx)
    if (!v.ok) {
      await recordEvent(
        { eventId, eventType: 'upload.rejected', contractId: contract_id, orgId, locationId,
          payload: { stage: 'validate', errors: v.errors } },
        supaUrl, serviceKey,
      )
      return NextResponse.json({ error: 'VALIDATION_FAILED', errors: v.errors }, { status: 422 })
    }
    await recordEvent(
      { eventId, eventType: 'upload.validated', contractId: contract_id, orgId, locationId, payload: {} },
      supaUrl, serviceKey,
    )

    // ── extract + parse ───────────────────────────────────────────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows:     Record<string, unknown>[] = []
    const rejected: unknown[]                 = []
    for await (const raw of contract.extract(source, pctx)) {
      const parsed = contract.parseRow(raw, pctx)
      if (parsed !== null) rows.push(parsed as Record<string, unknown>)
      else                 rejected.push(raw)
    }
    await recordEvent(
      { eventId, eventType: 'upload.parsed', contractId: contract_id, orgId, locationId,
        payload: { rowCount: rows.length, rejectedCount: rejected.length } },
      supaUrl, serviceKey,
    )

    // ── abort check ───────────────────────────────────────────────────────────
    const total = rows.length + rejected.length
    const pct   = total > 0 ? rejected.length / total : 0
    if (pct > 0.05) {
      await recordEvent(
        { eventId, eventType: 'upload.rejected', contractId: contract_id, orgId, locationId,
          payload: { stage: 'abort_check', rejectedPct: pct } },
        supaUrl, serviceKey,
      )
      return NextResponse.json(
        { error: 'TOO_MANY_REJECTED', rejectedPct: pct, threshold: 0.05 },
        { status: 422 },
      )
    }
    await recordEvent(
      { eventId, eventType: 'upload.abort_check', contractId: contract_id, orgId, locationId,
        payload: { rejectedPct: pct, passed: true } },
      supaUrl, serviceKey,
    )

    // ── commit ────────────────────────────────────────────────────────────────
    const hashes       = rows.map(r => contract.computeHash(r))
    const existing     = await queryExistingHashes(contract, locationId, hashes, supaUrl, svc)
    const newCount     = hashes.length - existing.size
    const updatedCount = existing.size
    const deleted      = await deleteByHashes(contract, locationId, hashes, supaUrl, svc)
    const { inserted, failed } = await insertBatch(contract.table, rows, supaUrl, svc)
    await recordEvent(
      { eventId, eventType: 'upload.committed', contractId: contract_id, orgId, locationId,
        payload: { inserted, newCount, updatedCount, deleted, failed, requestHash } },
      supaUrl, serviceKey,
    )

    return NextResponse.json({
      success:      true,
      event_id:     eventId,
      contract_id,
      request_hash: requestHash,
      status:       'committed',
      [contract.datasetType]: {
        processed: rows.length,
        new:       newCount,
        updated:   updatedCount,
        rejected:  rejected.length,
        failed,
      },
      errors: [],
    })
  } catch (err: unknown) {
    const error = err instanceof Error ? err.message : String(err)
    if (supaUrl && serviceKey) {
      try {
        await recordEvent(
          { eventId, eventType: 'upload.failed', contractId: contract_id, orgId, locationId,
            payload: { error } },
          supaUrl, serviceKey,
        )
      } catch {
        // best-effort: don't mask the original error
      }
    }
    return NextResponse.json({ error }, { status: 500 })
  }
}
