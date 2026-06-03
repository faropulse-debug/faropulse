import { NextRequest, NextResponse } from 'next/server'
import { getContract } from '@/src/lib/upload/contracts/registry'
import { runUploadPipeline } from '@/src/lib/upload/pipeline/runPipeline'

export async function POST(req: NextRequest) {
  const supaUrl    = process.env.NEXT_PUBLIC_SUPABASE_URL  ?? ''
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''

  const form       = await req.formData()
  const file       = form.get('ventas')      as File   | null
  const orgId      = form.get('org_id')      as string | null
  const locationId = form.get('location_id') as string | null

  if (!locationId || !orgId) {
    return NextResponse.json({ error: 'Faltan location_id u org_id' }, { status: 400 })
  }
  if (!file) {
    return NextResponse.json({ error: 'Se requiere al menos un archivo (ventas o items)' }, { status: 400 })
  }

  const contract = getContract('maxirest-sales')!
  const dryRun   = req.nextUrl?.searchParams?.get('dry_run') === 'true'

  const r = await runUploadPipeline(contract, file, orgId, locationId, supaUrl, serviceKey, { dryRun })

  // Compat: frontend reads result.documents; pipeline returns result.sales
  if (r.body.sales) r.body.documents = r.body.sales

  return NextResponse.json(r.body, { status: r.httpStatus })
}
