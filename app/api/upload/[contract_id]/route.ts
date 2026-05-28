import { NextRequest, NextResponse } from 'next/server'
import { getContract, listContracts } from '@/src/lib/upload/contracts/registry'
import { recordEvent } from '@/src/lib/upload/pipeline/recordEvent'
import { computeRequestHash } from '@/src/lib/upload/pipeline/computeRequestHash'

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

  const supaUrl    = process.env.NEXT_PUBLIC_SUPABASE_URL    ?? ''
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY   ?? ''

  let orgId:      string | null = null
  let locationId: string | null = null

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

    const event = await recordEvent(
      {
        eventType:  'upload.received',
        contractId: contract_id,
        orgId,
        locationId,
        payload: {
          requestHash,
          fileName:   file.name,
          sourceType: contract.sourceType,
        },
      },
      supaUrl,
      serviceKey,
    )

    return NextResponse.json({
      success:      true,
      event_id:     event.event_id,
      contract_id,
      request_hash: requestHash,
      status:       'received',
    })
  } catch (err: unknown) {
    const error = err instanceof Error ? err.message : String(err)
    if (supaUrl && serviceKey) {
      try {
        await recordEvent(
          {
            eventType:  'upload.failed',
            contractId: contract_id,
            orgId,
            locationId,
            payload: { error },
          },
          supaUrl,
          serviceKey,
        )
      } catch {
        // best-effort: don't mask the original error
      }
    }
    return NextResponse.json({ error }, { status: 500 })
  }
}
