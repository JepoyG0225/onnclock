import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const schema = z.object({
  name: z.string().min(2),
  code: z.string().min(1).max(10),
  daysEntitled: z.number().min(0),
  isWithPay: z.boolean().default(true),
  isMandatory: z.boolean().default(false),
  carryOver: z.boolean().default(false),
  maxCarryOver: z.number().optional().nullable(),
  genderRestriction: z.enum(['MALE', 'FEMALE']).optional().nullable(),
  requiresDocuments: z.boolean().default(false),
  description: z.string().optional().nullable(),
})

export async function GET(req: NextRequest) {
  const { ctx, error } = await requireAuth()
  if (error) return error

  const types = await prisma.leaveType.findMany({
    where: { companyId: ctx.companyId, isActive: true },
    orderBy: { name: 'asc' },
  })

  return NextResponse.json({ types })
}

export async function POST(req: NextRequest) {
  const { ctx, error } = await requireAuth()
  if (error) return error

  const body = await req.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const type = await prisma.leaveType.create({
    data: { companyId: ctx.companyId, ...parsed.data },
  })

  return NextResponse.json(type, { status: 201 })
}

export async function PATCH(req: NextRequest) {
  const { ctx, error } = await requireAuth()
  if (error) return error

  const body = await req.json()
  const { id, ...rest } = body

  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const parsed = schema.partial().safeParse(rest)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const type = await prisma.leaveType.updateMany({
    where: { id, companyId: ctx.companyId },
    data: parsed.data,
  })

  return NextResponse.json(type)
}
