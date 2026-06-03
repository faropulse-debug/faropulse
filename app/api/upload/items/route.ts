import { NextRequest, NextResponse } from 'next/server'
import { getContract } from '@/src/lib/upload/contracts/registry'
import { runUploadPipeline } from '@/src/lib/upload/pipeline/runPipeline'

export async function POST(req: NextRequest) {
  const supaUrl    = process.env.NEXT_PUBLIC_SUPABASE_URL  ?? ''
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''

  const form       = await req.formData()
  const file       = form.get('items')       as File   | null
  const orgId      = form.get('org_id')      as string | null
  const locationId = form.get('location_id') as string | null

  if (!locationId || !orgId) {
    return NextResponse.json({ error: 'Faltan location_id u org_id' }, { status: 400 })
  }
  if (!file) {
    return NextResponse.json({ error: 'Se requiere el archivo items' }, { status: 400 })
  }

  const contract = getContract('maxirest-items')!
  const dryRun   = req.nextUrl?.searchParams?.get('dry_run') === 'true'

  const r = await runUploadPipeline(contract, file, orgId, locationId, supaUrl, serviceKey, { dryRun })

  return NextResponse.json(r.body, { status: r.httpStatus })
}
