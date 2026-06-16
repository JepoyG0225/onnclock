import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAuth, requireSuperAdmin } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'

const schema = z.object({
  status: z.enum(['PAID', 'UNPAID', 'VOID']),
})

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { ctx, error } = await requireAuth()
  if (error) return error
  const denied = requireSuperAdmin(ctx)
  if (denied) return denied

  const { id } = await params
  const body = schema.parse(await req.json())

  const invoice = await prisma.invoice.update({
    where: { id },
    data: {
      status: body.status,
      paidAt: body.status === 'PAID' ? new Date() : null,
      updatedAt: new Date(),
    },
    select: {
      id: true,
      status: true,
      paidAt: true,
      updatedAt: true,
    },
  })

  return NextResponse.json({ invoice })
}

