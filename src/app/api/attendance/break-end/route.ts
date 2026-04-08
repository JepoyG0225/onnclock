import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'

export async function POST(req: NextRequest) {
  const { ctx, error } = await requireAuth()
  if (error) return error

  const employee = await prisma.employee.findFirst({
    where: { userId: ctx.userId, companyId: ctx.companyId, isActive: true },
  })
  if (!employee) return NextResponse.json({ error: 'Employee not found' }, { status: 404 })

  const now = new Date()
  const manilaOffsetMs = 8 * 60 * 60 * 1000
  const manila = new Date(now.getTime() + manilaOffsetMs)
  const yyyy = manila.getUTCFullYear()
  const mm = String(manila.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(manila.getUTCDate()).padStart(2, '0')
  const manilaDate = new Date(`${yyyy}-${mm}-${dd}`)

  const existing = await prisma.dTRRecord.findFirst({
    where: { employeeId: employee.id, date: manilaDate },
  })

  if (!existing?.timeIn) {
    return NextResponse.json({ error: 'Not clocked in yet today' }, { status: 409 })
  }
  if (existing.timeOut) {
    return NextResponse.json({ error: 'Already clocked out today' }, { status: 409 })
  }
  if (!existing.breakIn || existing.breakOut) {
    return NextResponse.json({ error: 'No active break' }, { status: 409 })
  }

  const record = await prisma.dTRRecord.update({
    where: { id: existing.id },
    data: {
      breakOut: now,
    },
  })

  return NextResponse.json({ record, message: 'Break ended' })
}
