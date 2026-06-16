import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const settingsSchema = z.object({
  startMonth: z.number().int().min(1).max(12),
  startDay: z.number().int().min(1).max(31),
  endMonth: z.number().int().min(1).max(12),
  endDay: z.number().int().min(1).max(31),
})

export async function GET(req: NextRequest) {
  const { ctx, error } = await requireAuth()
  if (error) return error

  const { searchParams } = new URL(req.url)
  const year = parseInt(searchParams.get('year') ?? String(new Date().getFullYear()))
  const settings = await prisma.company.findUnique({
    where: { id: ctx.companyId },
    select: {
      thirteenthPayStartMonth: true,
      thirteenthPayStartDay: true,
      thirteenthPayEndMonth: true,
      thirteenthPayEndDay: true,
    },
  })

  const entries = await prisma.thirteenthMonthLog.findMany({
    where: { companyId: ctx.companyId, year },
    include: {
      employee: {
        select: {
          firstName: true, lastName: true, employeeNo: true,
          department: { select: { name: true } },
          position: { select: { title: true } },
        },
      },
    },
    orderBy: [{ employee: { lastName: 'asc' } }, { employee: { firstName: 'asc' } }],
  })

  return NextResponse.json({
    entries,
    year,
    settings: {
      startMonth: settings?.thirteenthPayStartMonth ?? 1,
      startDay: settings?.thirteenthPayStartDay ?? 1,
      endMonth: settings?.thirteenthPayEndMonth ?? 12,
      endDay: settings?.thirteenthPayEndDay ?? 31,
    },
  })
}

export async function PATCH(req: NextRequest) {
  const { ctx, error } = await requireAuth()
  if (error) return error

  const body = await req.json().catch(() => null)
  const parsed = settingsSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const { startMonth, startDay, endMonth, endDay } = parsed.data
  const baseYear = 2024
  const startDate = new Date(Date.UTC(baseYear, startMonth - 1, startDay))
  const endDate = new Date(Date.UTC(baseYear, endMonth - 1, endDay))
  const startValid = startDate.getUTCMonth() === startMonth - 1 && startDate.getUTCDate() === startDay
  const endValid = endDate.getUTCMonth() === endMonth - 1 && endDate.getUTCDate() === endDay
  if (!startValid || !endValid) {
    return NextResponse.json({ error: 'Invalid start or end date' }, { status: 400 })
  }

  await prisma.company.update({
    where: { id: ctx.companyId },
    data: {
      thirteenthPayStartMonth: startMonth,
      thirteenthPayStartDay: startDay,
      thirteenthPayEndMonth: endMonth,
      thirteenthPayEndDay: endDay,
    },
  })

  return NextResponse.json({ ok: true })
}
