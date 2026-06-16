import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { hash } from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/api-auth'

const schema = z.object({
  newPassword: z.string().min(8),
})

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { ctx, error } = await requireAuth(['COMPANY_ADMIN'])
  if (error) return error

  const { id } = await params
  const body = await req.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation error' }, { status: 422 })
  }

  const member = await prisma.userCompany.findFirst({
    where: { companyId: ctx.companyId, userId: id },
    select: { userId: true },
  })
  if (!member) {
    return NextResponse.json({ error: 'User not found in this company' }, { status: 404 })
  }

  const passwordHash = await hash(parsed.data.newPassword, 12)
  await prisma.user.update({
    where: { id },
    data: { passwordHash },
  })

  return NextResponse.json({ success: true })
}
