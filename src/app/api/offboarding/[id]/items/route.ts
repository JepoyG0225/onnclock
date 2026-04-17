import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const createSchema = z.object({
  category: z.string().min(1),
  title: z.string().min(1),
  description: z.string().nullable().optional(),
  sortOrder: z.number().optional(),
})

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { ctx, error } = await requireAuth()
  if (error) return error

  const { id } = await params

  const process = await prisma.offboardingProcess.findFirst({
    where: { id, companyId: ctx.companyId },
    select: { id: true },
  })
  if (!process) {
    return NextResponse.json({ error: 'Offboarding process not found' }, { status: 404 })
  }

  const body = await req.json()
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation error', details: parsed.error.flatten() }, { status: 422 })
  }

  // Default sortOrder: max existing + 1
  let sortOrder = parsed.data.sortOrder
  if (sortOrder === undefined) {
    const max = await prisma.offboardingItem.aggregate({
      where: { processId: id },
      _max: { sortOrder: true },
    })
    sortOrder = (max._max.sortOrder ?? 0) + 1
  }

  const item = await prisma.offboardingItem.create({
    data: {
      processId: id,
      category: parsed.data.category,
      title: parsed.data.title,
      description: parsed.data.description ?? null,
      sortOrder,
    },
  })

  return NextResponse.json({ item }, { status: 201 })
}
