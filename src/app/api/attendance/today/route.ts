import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const { ctx, error } = await requireAuth()
  if (error) return error

  const employee = await prisma.employee.findFirst({
    where: { userId: ctx.userId, companyId: ctx.companyId, isActive: true },
    include: {
      workSchedule: { select: { id: true, name: true, requireSelfieOnClockIn: true } },
    },
  })
  if (!employee) return NextResponse.json({ record: null })

  const now = new Date()
  const manilaOffsetMs = 8 * 60 * 60 * 1000
  const manila = new Date(now.getTime() + manilaOffsetMs)
  const yyyy = manila.getUTCFullYear()
  const mm = String(manila.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(manila.getUTCDate()).padStart(2, '0')
  const manilaDate = new Date(`${yyyy}-${mm}-${dd}`)

  const record = await prisma.dTRRecord.findFirst({
    where: { employeeId: employee.id, date: manilaDate },
  })

  return NextResponse.json({ record, employee })
}
