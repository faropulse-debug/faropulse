// eslint-disable-next-line @typescript-eslint/no-explicit-any
import type { DataSourceContract } from '../contracts/types'
import { buildSvcHeaders } from './types'
import { computeRequestHash } from './computeRequestHash'
import { recordEvent } from './recordEvent'
import { queryCommittedByRequestHash } from './queryCommittedByRequestHash'
import { queryExistingHashes } from './queryExistingHashes'
import { commitUpload } from './commitUpload'

export interface PipelineResult {
  httpStatus: number
  body:       Record<string, unknown>
}

export async function runUploadPipeline(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  contract:   DataSourceContract<any>,
  file:       File,
  orgId:      string,
  locationId: string,
  supaUrl:    string,
  serviceKey: string,
): Promise<PipelineResult> {
  const contractId = contract.id
  const svc        = buildSvcHeaders(serviceKey)
  let eventId: string | undefined

  try {
    const buffer      = await file.arrayBuffer()
    const requestHash = computeRequestHash(buffer)

    // ── upload.received ───────────────────────────────────────────────────────
    const received = await recordEvent(
      {
        eventType:  'upload.received',
        contractId,
        orgId,
        locationId,
        payload: { requestHash, fileName: file.name, sourceType: contract.sourceType },
      },
      supaUrl,
      serviceKey,
    )
    eventId = received.event_id

    // ── idempotency short-circuit ─────────────────────────────────────────────
    const cached = await queryCommittedByRequestHash(requestHash, contractId, locationId, supaUrl, svc)
    if (cached) {
      await recordEvent(
        { eventId, eventType: 'upload.duplicate_skipped', contractId, orgId, locationId,
          payload: { requestHash, originalEventId: cached.event_id } },
        supaUrl, serviceKey,
      )
      const p = cached.payload
      return {
        httpStatus: 200,
        body: {
          success:           true,
          event_id:          eventId,
          contract_id:       contractId,
          request_hash:      requestHash,
          status:            'duplicate_skipped',
          original_event_id: cached.event_id,
          [contract.datasetType]: {
            processed: ((p.newCount as number) ?? 0) + ((p.updatedCount as number) ?? 0),
            new:       (p.newCount     as number) ?? 0,
            updated:   (p.updatedCount as number) ?? 0,
            rejected:  0,
            failed:    (p.failed       as number) ?? 0,
          },
          errors: [],
        },
      }
    }

    const pctx   = { orgId, locationId, eventId: eventId }
    const source = { type: contract.sourceType, payload: file }

    // ── validate ──────────────────────────────────────────────────────────────
    const v = await contract.validate(source, pctx)
    if (!v.ok) {
      await recordEvent(
        { eventId, eventType: 'upload.rejected', contractId, orgId, locationId,
          payload: { stage: 'validate', errors: v.errors } },
        supaUrl, serviceKey,
      )
      return { httpStatus: 422, body: { error: 'VALIDATION_FAILED', errors: v.errors } }
    }
    await recordEvent(
      { eventId, eventType: 'upload.validated', contractId, orgId, locationId, payload: {} },
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
      { eventId, eventType: 'upload.parsed', contractId, orgId, locationId,
        payload: { rowCount: rows.length, rejectedCount: rejected.length } },
      supaUrl, serviceKey,
    )

    // ── abort check ───────────────────────────────────────────────────────────
    const total = rows.length + rejected.length
    const pct   = total > 0 ? rejected.length / total : 0
    if (pct > 0.05) {
      await recordEvent(
        { eventId, eventType: 'upload.rejected', contractId, orgId, locationId,
          payload: { stage: 'abort_check', rejectedPct: pct } },
        supaUrl, serviceKey,
      )
      return {
        httpStatus: 422,
        body: { error: 'TOO_MANY_REJECTED', rejectedPct: pct, threshold: 0.05 },
      }
    }
    await recordEvent(
      { eventId, eventType: 'upload.abort_check', contractId, orgId, locationId,
        payload: { rejectedPct: pct, passed: true } },
      supaUrl, serviceKey,
    )

    // ── commit ────────────────────────────────────────────────────────────────
    const hashes            = rows.map(r => contract.computeHash(r))
    const existing          = await queryExistingHashes(contract, locationId, hashes, supaUrl, svc)
    const newCount          = hashes.length - existing.size
    const updatedCount      = existing.size
    const { deleted, inserted } = await commitUpload(contract, locationId, hashes, rows, supaUrl, svc)
    await recordEvent(
      { eventId, eventType: 'upload.committed', contractId, orgId, locationId,
        payload: { inserted, newCount, updatedCount, deleted, failed: 0, requestHash } },
      supaUrl, serviceKey,
    )

    return {
      httpStatus: 200,
      body: {
        success:      true,
        event_id:     eventId,
        contract_id:  contractId,
        request_hash: requestHash,
        status:       'committed',
        [contract.datasetType]: {
          processed: rows.length,
          new:       newCount,
          updated:   updatedCount,
          rejected:  rejected.length,
          failed:    0,
        },
        errors: [],
      },
    }
  } catch (err: unknown) {
    const error = err instanceof Error ? err.message : String(err)
    if (supaUrl && serviceKey) {
      try {
        await recordEvent(
          { eventId, eventType: 'upload.failed', contractId, orgId, locationId,
            payload: { error } },
          supaUrl, serviceKey,
        )
      } catch {
        // best-effort: don't mask the original error
      }
    }
    return { httpStatus: 500, body: { error } }
  }
}
