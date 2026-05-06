import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAuth, requireSuperAdmin } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'

const schema = z.object({
  isActive: z.boolean().optional(),
  demoStatus: z.enum([
    'NOT_CONTACTED',
    'EMAIL_SENT',
    'DEMO_REQUESTED',
    'DEMO_SCHEDULED',
    'DEMO_COMPLETED',
    'NO_SHOW',
    'NOT_INTERESTED',
  ]).optional(),
  demoNotes: z.string().optional(),
  demoScheduledAt: z.string().datetime().optional().nullable(),
})

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ companyId: string }> }
) {
  const { ctx, error } = await requireAuth()
  if (error) return error
  const denied = requireSuperAdmin(ctx)
  if (denied) return denied

  const { companyId } = await params
  const body = schema.parse(await req.json())

  const company = await prisma.company.update({
    where: { id: companyId },
    data: {
      ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
      ...(body.demoStatus !== undefined ? { demoStatus: body.demoStatus } : {}),
      ...(body.demoNotes !== undefined ? { demoNotes: body.demoNotes } : {}),
      ...(body.demoScheduledAt !== undefined ? { demoScheduledAt: body.demoScheduledAt ? new Date(body.demoScheduledAt) : null } : {}),
    },
    select: { id: true, isActive: true, demoStatus: true, demoEmailSentAt: true, updatedAt: true },
  })

  return NextResponse.json({ company })
}
