/** POST /api/assets/[id]/return — mark current active assignment as RETURNED */
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, resolveCompanyIdForRequest } from '@/lib/api-auth'
import { requireHrisProOrTrialApi } from '@/lib/hris-pro'
import { prisma } from '@/lib/prisma'
import { createNotification, userIdForEmployee } from '@/lib/notifications'
import { z } from 'zod'

const HR_ROLES = ['COMPANY_ADMIN', 'HR_MANAGER', 'SUPER_ADMIN']

const schema = z.object({
  conditionAtReturn: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
})

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { ctx, error } = await requireAuth()
  if (error) return error
  if (!HR_ROLES.includes(ctx.role)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  const companyId = resolveCompanyIdForRequest(ctx, req)
  if (!companyId) return NextResponse.json({ error: 'companyId is required' }, { status: 400 })
  const gate = await requireHrisProOrTrialApi(companyId)
  if (gate) return gate
  const { id: assetId } = await params

  const asset = await prisma.companyAsset.findFirst({
    where: { id: assetId, companyId },
    include: { assignments: { where: { status: 'ACTIVE' }, take: 1, include: { employee: { select: { id: true, firstName: true, lastName: true } } } } },
  })
  if (!asset) return NextResponse.json({ error: 'Asset not found' }, { status: 404 })
  const active = asset.assignments[0]
  if (!active) return NextResponse.json({ error: 'Asset has no active assignment' }, { status: 409 })

  const body = await req.json().catch(() => null)
  const parsed = schema.safeParse(body ?? {})
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
  }
  const d = parsed.data

  await prisma.$transaction(async (tx) => {
    await tx.assetAssignment.update({
      where: { id: active.id },
      data: {
        status: 'RETURNED',
        returnedAt: new Date(),
        returnedById: ctx.userId,
        conditionAtReturn: d.conditionAtReturn ?? null,
        ...(d.notes ? { notes: d.notes } : {}),
      },
    })
    await tx.companyAsset.update({
      where: { id: assetId },
      data: { status: 'AVAILABLE' },
    })
  })

  const recipientUserId = await userIdForEmployee(active.employee.id)
  if (recipientUserId) {
    await createNotification({
      companyId,
      userId: recipientUserId,
      type: 'ASSET_RETURNED',
      title: `Asset return logged: ${asset.name}`,
      body: `Thank you for returning ${asset.category}${asset.assetTag ? ` · ${asset.assetTag}` : ''}.`,
      link: '/portal/profile',
    })
  }

  return NextResponse.json({ success: true })
}
