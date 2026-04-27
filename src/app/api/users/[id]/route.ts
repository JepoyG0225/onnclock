import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/api-auth'

const updateUserSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(190),
})

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { ctx, error } = await requireAuth(['COMPANY_ADMIN'])
  if (error) return error

  const { id } = await params
  const body = await req.json().catch(() => null)
  const parsed = updateUserSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation error', details: parsed.error.flatten() }, { status: 422 })
  }

  const member = await prisma.userCompany.findFirst({
    where: { companyId: ctx.companyId, userId: id },
    select: { userId: true },
  })
  if (!member) {
    return NextResponse.json({ error: 'User not found in this company' }, { status: 404 })
  }

  try {
    await prisma.user.update({
      where: { id },
      data: {
        name: parsed.data.name,
        email: parsed.data.email.toLowerCase(),
      },
    })
    return NextResponse.json({ success: true })
  } catch (e) {
    if (e && typeof e === 'object' && 'code' in e && (e as { code: string }).code === 'P2002') {
      return NextResponse.json({ error: 'Email is already in use' }, { status: 409 })
    }
    return NextResponse.json({ error: 'Failed to update user' }, { status: 500 })
  }
}
