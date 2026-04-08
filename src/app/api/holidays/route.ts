import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const holidaySchema = z.object({
  name: z.string().min(2),
  date: z.string(),   // YYYY-MM-DD
  type: z.enum(['REGULAR', 'SPECIAL_NON_WORKING', 'SPECIAL_WORKING']),
  description: z.string().optional(),
})

export async function GET(req: NextRequest) {
  const { ctx, error } = await requireAuth()
  if (error) return error

  const { searchParams } = new URL(req.url)
  const year = parseInt(searchParams.get('year') ?? String(new Date().getFullYear()))

  const holidays = await prisma.holiday.findMany({
    where: {
      companyId: ctx.companyId,
      date: {
        gte: new Date(year, 0, 1),
        lte: new Date(year, 11, 31),
      },
    },
    orderBy: { date: 'asc' },
  })

  return NextResponse.json({ holidays })
}

export async function POST(req: NextRequest) {
  const { ctx, error } = await requireAuth()
  if (error) return error

  const body = await req.json()
  const parsed = holidaySchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const holiday = await prisma.holiday.create({
    data: {
      companyId: ctx.companyId,
      name: parsed.data.name,
      date: new Date(parsed.data.date),
      type: parsed.data.type,
      description: parsed.data.description ?? null,
    },
  })

  return NextResponse.json(holiday, { status: 201 })
}

export async function DELETE(req: NextRequest) {
  const { ctx, error } = await requireAuth()
  if (error) return error

  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  await prisma.holiday.deleteMany({
    where: { id, companyId: ctx.companyId },
  })

  return NextResponse.json({ ok: true })
}
