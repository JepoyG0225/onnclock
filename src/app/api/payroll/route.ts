import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { getPeriodLabel } from '@/lib/utils'
import { z } from 'zod'

const createRunSchema = z.object({
  periodStart: z.string(),
  periodEnd: z.string(),
  payFrequency: z.enum(['SEMI_MONTHLY', 'MONTHLY', 'WEEKLY', 'DAILY']),
  payDate: z.string(),
  notes: z.string().optional(),
})

export async function GET(req: NextRequest) {
  const { ctx, error } = await requireAuth()
  if (error) return error

  const { searchParams } = new URL(req.url)
  const page = parseInt(searchParams.get('page') || '1')
  const limit = parseInt(searchParams.get('limit') || '20')

  const [runs, total] = await Promise.all([
    prisma.payrollRun.findMany({
      where: { companyId: ctx.companyId },
      orderBy: { periodStart: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.payrollRun.count({ where: { companyId: ctx.companyId } }),
  ])

  return NextResponse.json({ runs, total, page, limit })
}

export async function POST(req: NextRequest) {
  const { ctx, error } = await requireAuth()
  if (error) return error

  const body = await req.json()
  const parsed = createRunSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation error', details: parsed.error.flatten() }, { status: 422 })
  }

  const { periodStart, periodEnd, payFrequency, payDate, notes } = parsed.data
  const start = new Date(periodStart)
  const end = new Date(periodEnd)

  const run = await prisma.payrollRun.create({
    data: {
      companyId: ctx.companyId,
      periodLabel: getPeriodLabel(start, end),
      periodStart: start,
      periodEnd: end,
      payFrequency,
      payDate: new Date(payDate),
      createdBy: ctx.userId,
      notes,
    },
  })

  return NextResponse.json({ run }, { status: 201 })
}
