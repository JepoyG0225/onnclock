import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const { ctx, error } = await requireAuth()
  if (error) return error

  const { searchParams } = new URL(req.url)
  const limit = Math.min(30, Math.max(1, parseInt(searchParams.get('limit') ?? '7')))

  const employee = await prisma.employee.findFirst({
    where: { userId: ctx.userId, companyId: ctx.companyId, isActive: true },
  })
  if (!employee) return NextResponse.json({ records: [] })

  const records = await prisma.dTRRecord.findMany({
    where: { employeeId: employee.id },
    orderBy: [{ date: 'desc' }],
    take: limit,
    select: {
      id: true,
      date: true,
      timeIn: true,
      timeOut: true,
      regularHours: true,
      lateMinutes: true,
      isHoliday: true,
      holidayType: true,
    },
  })

  return NextResponse.json({ records })
}
