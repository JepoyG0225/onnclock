import { ctxHasPermission } from '@/lib/auth/effective-permissions'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { requireHrisProApi } from '@/lib/hris-pro'
import { recruitmentModelsReady, recruitmentModelsUnavailableResponse } from '@/lib/recruitment-runtime'

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ processId: string }> }
) {
  const { ctx, error } = await requireAuth()
  if (error) return error
  if (!await ctxHasPermission(ctx, 'onboarding:manage')) return NextResponse.json({ error: 'Onboarding management permission required.' }, { status: 403 })

  const gate = await requireHrisProApi(ctx.companyId)
  if (gate) return gate
  if (!recruitmentModelsReady()) return recruitmentModelsUnavailableResponse()

  const { processId } = await params

  const process = await prisma.onboardingProcess.findFirst({
    where: { id: processId, companyId: ctx.companyId },
    select: { id: true },
  })
  if (!process) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await prisma.onboardingProcess.delete({ where: { id: processId } })

  return NextResponse.json({ ok: true })
}
