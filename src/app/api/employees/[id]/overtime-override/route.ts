import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { applyManualOtOverride } from '@/lib/overtime-requests'

const schema = z.object({
  from: z.coerce.date(),
  to: z.coerce.date(),
})

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { ctx, error } = await requireAuth(['SUPER_ADMIN', 'COMPANY_ADMIN', 'HR_MANAGER', 'PAYROLL_OFFICER'])
  if (error) return error
  const parsed = schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'A valid date range is required' }, { status: 422 })

  const employee = await prisma.employee.findFirst({ where: { id, companyId: ctx.companyId }, select: { id: true } })
  if (!employee) return NextResponse.json({ error: 'Employee not found' }, { status: 404 })

  const records = await prisma.dTRRecord.findMany({
    where: { employeeId: id, date: { gte: parsed.data.from, lte: parsed.data.to }, timeIn: { not: null }, timeOut: { not: null } },
    select: { date: true, regularHours: true, overtimeHours: true, timeIn: true, timeOut: true, breakIn: true, breakOut: true },
  })

  await prisma.employee.update({ where: { id }, data: { overtimePayOverride: true } })
  let convertedRecords = 0
  for (const record of records) {
    let hours = Number(record.overtimeHours ?? 0)
    if (hours <= 0 && record.timeIn && record.timeOut) {
      let elapsed = (record.timeOut.getTime() - record.timeIn.getTime()) / 3_600_000
      if (elapsed < 0) elapsed += 24
      const breakHours = record.breakIn && record.breakOut
        ? Math.max(0, (record.breakOut.getTime() - record.breakIn.getTime()) / 3_600_000)
        : 1
      hours = Math.round(Math.max(0, elapsed - breakHours - Number(record.regularHours ?? 0)) * 100) / 100
    }
    if (hours <= 0) continue
    await applyManualOtOverride({
      companyId: ctx.companyId,
      employeeId: id,
      date: record.date,
      hours,
      approvedById: ctx.userId,
      timeIn: record.timeIn,
      timeOut: record.timeOut,
    })
    convertedRecords += 1
  }

  return NextResponse.json({ success: true, convertedRecords })
}
