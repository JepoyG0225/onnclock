import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAuth, requireSuperAdmin } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'

const schema = z.object({
  isActive: z.boolean(),
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
    data: { isActive: body.isActive },
    select: { id: true, isActive: true, updatedAt: true },
  })

  return NextResponse.json({ company })
}

