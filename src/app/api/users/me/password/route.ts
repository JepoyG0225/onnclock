import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { compare, hash } from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/api-auth'

const schema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8),
})

export async function POST(req: NextRequest) {
  const { ctx, error } = await requireAuth()
  if (error) return error

  const body = await req.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation error' }, { status: 422 })
  }

  const user = await prisma.user.findUnique({
    where: { id: ctx.userId },
    select: { id: true, passwordHash: true },
  })
  if (!user?.passwordHash) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  const valid = await compare(parsed.data.currentPassword, user.passwordHash)
  if (!valid) {
    return NextResponse.json({ error: 'Current password is incorrect' }, { status: 400 })
  }

  const passwordHash = await hash(parsed.data.newPassword, 12)
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash },
  })

  return NextResponse.json({ success: true })
}
