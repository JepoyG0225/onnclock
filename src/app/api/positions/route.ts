import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const schema = z.object({
  title: z.string().min(2),
  code: z.string().optional().nullable(),
  payGradeId: z.string().optional().nullable(),
})

export async function GET(req: NextRequest) {
  const { ctx, error } = await requireAuth()
  if (error) return error

  const positions = await prisma.position.findMany({
    where: { companyId: ctx.companyId, isActive: true },
    include: {
      payGrade: { select: { name: true, minSalary: true, maxSalary: true } },
      _count: { select: { employees: true } },
    },
    orderBy: { title: 'asc' },
  })

  return NextResponse.json({ positions })
}

export async function POST(req: NextRequest) {
  const { ctx, error } = await requireAuth()
  if (error) return error

  const body = await req.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const pos = await prisma.position.create({
    data: {
      companyId:    ctx.companyId,
      title:        parsed.data.title,
      code:         parsed.data.code ?? null,
      payGradeId:   parsed.data.payGradeId ?? null,
    },
  })

  return NextResponse.json(pos, { status: 201 })
}

export async function DELETE(req: NextRequest) {
  const { ctx, error } = await requireAuth()
  if (error) return error

  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  await prisma.position.updateMany({
    where: { id, companyId: ctx.companyId },
    data: { isActive: false },
  })

  return NextResponse.json({ ok: true })
}
