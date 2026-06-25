// eslint-disable-next-line @typescript-eslint/no-explicit-any
import type { DataSourceContract } from '../contracts/types'
import { buildSvcHeaders } from './types'
import { computeRequestHash } from './computeRequestHash'
import { recordEvent } from './recordEvent'
import { queryCommittedByRequestHash } from './queryCommittedByRequestHash'
import { queryExistingHashes } from './queryExistingHashes'
import { commitUpload } from './commitUpload'
import { upsertFreshness } from '../helpers'
import { randomUUID } from 'crypto'

export interface PipelineOptions {
  dryRun?: boolean
}

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
  options:    PipelineOptions = {},
): Promise<PipelineResult> {
  const contractId = contract.id
  const dryRun     = options.dryRun === true
  const svc        = buildSvcHeaders(serviceKey)
  let eventId: string | undefined

  try {
    const buffer      = await file.arrayBuffer()
    const requestHash = computeRequestHash(buffer)

    // ── upload.received ───────────────────────────────────────────────────────
    if (dryRun) {
      eventId = randomUUID()
    } else {
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
    }

    // ── idempotency short-circuit ─────────────────────────────────────────────
    const cached = await queryCommittedByRequestHash(requestHash, contractId, locationId, supaUrl, svc)
    if (cached) {
      const p = cached.payload

      if (dryRun) {
        return {
          httpStatus: 200,
          body: {
            success:      true,
            dryRun:       true,
            contract_id:  contractId,
            request_hash: requestHash,
            status:       'dry_run_duplicate',
            wouldCommit:  false,
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

      // Guard: verify the previously committed data still exists before short-circuiting.
      // If the table was cleared after the original commit, fall through and reinsert.
      const col        = String(Array.isArray(contract.hashColumn) ? contract.hashColumn[0] : contract.hashColumn)
      const verifyUrl  = `${supaUrl}/rest/v1/${contract.table}?location_id=eq.${encodeURIComponent(locationId)}&select=${col}&limit=1`
      const verifyRes  = await fetch(verifyUrl, { headers: svc })
      const dataExists = verifyRes.ok && ((await verifyRes.json() as unknown[]).length > 0)

      if (dataExists) {
        await recordEvent(
          { eventId, eventType: 'upload.duplicate_skipped', contractId, orgId, locationId,
            payload: { requestHash, originalEventId: cached.event_id } },
          supaUrl, serviceKey,
        )
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
      // dataExists = false → table was cleared; fall through to full pipeline
    }

    const pctx   = { orgId, locationId, eventId: eventId! }
    const source = { type: contract.sourceType, payload: file }

    // ── validate ──────────────────────────────────────────────────────────────
    const v = await contract.validate(source, pctx)
    if (!v.ok) {
      if (!dryRun) {
        await recordEvent(
          { eventId, eventType: 'upload.rejected', contractId, orgId, locationId,
            payload: { stage: 'validate', errors: v.errors } },
          supaUrl, serviceKey,
        )
      }
      return { httpStatus: 422, body: { error: 'VALIDATION_FAILED', errors: v.errors } }
    }
    if (!dryRun) {
      await recordEvent(
        { eventId, eventType: 'upload.validated', contractId, orgId, locationId, payload: {} },
        supaUrl, serviceKey,
      )
    }

    // ── extract + parse ───────────────────────────────────────────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows:     Record<string, unknown>[] = []
    const rejected: unknown[]                 = []
    for await (const raw of contract.extract(source, pctx)) {
      const parsed = contract.parseRow(raw, pctx)
      if (parsed !== null) rows.push(parsed as Record<string, unknown>)
      else                 rejected.push(raw)
    }
    if (!dryRun) {
      await recordEvent(
        { eventId, eventType: 'upload.parsed', contractId, orgId, locationId,
          payload: { rowCount: rows.length, rejectedCount: rejected.length } },
        supaUrl, serviceKey,
      )
    }

    // ── abort check ───────────────────────────────────────────────────────────
    const total = rows.length + rejected.length
    const pct   = total > 0 ? rejected.length / total : 0
    if (pct > 0.05) {
      if (!dryRun) {
        await recordEvent(
          { eventId, eventType: 'upload.rejected', contractId, orgId, locationId,
            payload: { stage: 'abort_check', rejectedPct: pct } },
          supaUrl, serviceKey,
        )
      }
      return {
        httpStatus: 422,
        body: { error: 'TOO_MANY_REJECTED', rejectedPct: pct, threshold: 0.05 },
      }
    }
    if (!dryRun) {
      await recordEvent(
        { eventId, eventType: 'upload.abort_check', contractId, orgId, locationId,
          payload: { rejectedPct: pct, passed: true } },
        supaUrl, serviceKey,
      )
    }

    // ── enrich rows (cross-row derived fields, e.g. occurrence-based hashes) ──
    if (contract.enrichRows) contract.enrichRows(rows)

    // ── commit ────────────────────────────────────────────────────────────────
    const hashes       = rows.map(r => contract.computeHash(r))
    const existing     = await queryExistingHashes(contract, locationId, hashes, supaUrl, svc)
    const newCount     = hashes.length - existing.size
    const updatedCount = existing.size

    // ── dateRange (visible in upload UI) ──────────────────────────────────────
    const dc        = contract.dateColumn
    let   dateRange = ''
    if (dc) {
      const fechas = [...new Set(rows.map(r => r[dc]).filter(Boolean))].sort() as string[]
      if (fechas.length) dateRange = `${fechas[0]} – ${fechas[fechas.length - 1]}`
    }

    if (dryRun) {
      return {
        httpStatus: 200,
        body: {
          success:      true,
          dryRun:       true,
          contract_id:  contractId,
          request_hash: requestHash,
          status:       'dry_run',
          wouldCommit:  true,
          [contract.datasetType]: {
            processed: rows.length,
            new:       newCount,
            updated:   updatedCount,
            rejected:  rejected.length,
            failed:    0,
          },
          dateRange,
          rejections: rejected,
          errors: [],
        },
      }
    }

    const { deleted, inserted } = await commitUpload(contract, locationId, hashes, rows, supaUrl, svc)

    // ── freshness (non-blocking write to data_freshness table) ────────────────
    // Spread Prefer to satisfy helpers.SvcHeaders type; upsertFreshness overrides it internally.
    await upsertFreshness(locationId, contract.table, inserted, supaUrl, { ...svc, Prefer: '' })

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
        dateRange,
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
