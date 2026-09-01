import { NextRequest, NextResponse } from 'next/server'
import { requireMembership } from '@/lib/api-auth'
import { WRITE_ROLES } from '@/lib/authz'
import { getContract, listContracts } from '@/src/lib/upload/contracts/registry'
import { runUploadPipeline } from '@/src/lib/upload/pipeline/runPipeline'

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

  const locationId = req.nextUrl.searchParams.get('location_id')
  if (!locationId) {
    return NextResponse.json({ error: 'MISSING_LOCATION_ID' }, { status: 400 })
  }

  const authResult = await requireMembership(req, locationId, { roles: WRITE_ROLES })
  if (authResult instanceof Response) return authResult
  const { userId } = authResult

  const form  = await req.formData()
  const file  = form.get(contract.datasetType) as File | null
  const orgId = form.get('org_id') as string | null

  if (!file) {
    return NextResponse.json(
      { error: 'MISSING_FILE', detail: `Expected form field: ${contract.datasetType}` },
      { status: 400 },
    )
  }
  if (!orgId) {
    return NextResponse.json({ error: 'MISSING_ORG_ID' }, { status: 400 })
  }

  const dryRun = req.nextUrl.searchParams.get('dry_run') === 'true'
  const r = await runUploadPipeline(contract, file, orgId, locationId, supaUrl, serviceKey, { dryRun, actorUserId: userId })
  return NextResponse.json(r.body, { status: r.httpStatus })
}
