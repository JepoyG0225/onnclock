import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { renderToBuffer } from '@react-pdf/renderer'
import { TardinessReportDocument } from '@/lib/pdf/tardiness-report-template'
import { registerPdfFonts } from '@/lib/pdf/register-pdf-fonts'
import { format } from 'date-fns'
import React from 'react'

export async function GET(req: NextRequest) {
  registerPdfFonts()

  const { ctx, error } = await requireAuth()
  if (error) return error

  const { searchParams } = new URL(req.url)
  const weekStart = searchParams.get('weekStart')
  const weekEnd   = searchParams.get('weekEnd')

  if (!weekStart || !weekEnd) {
    return NextResponse.json({ error: 'weekStart and weekEnd are required' }, { status: 400 })
  }

  const company = await prisma.company.findUnique({
    where: { id: ctx.companyId },
    select: { name: true },
  })

  const start = new Date(weekStart)
  const end   = new Date(weekEnd)
  const endPlus = new Date(end)
  endPlus.setDate(endPlus.getDate() + 1)

  const records = await prisma.dTRRecord.findMany({
    where: {
      employee: { companyId: ctx.companyId },
      date: { gte: start, lt: endPlus },
    },
    include: {
      employee: {
        select: {
          firstName: true,
          lastName: true,
          employeeNo: true,
          department: { select: { name: true } },
        },
      },
    },
    orderBy: { date: 'asc' },
  })

  // Group by employee
  const empMap = new Map<string, {
    employeeName: string
    employeeNo: string
    department: string
    tardyDays: number
    totalLate: number
    totalUndertime: number
    absentDays: number
  }>()

  for (const r of records) {
    const key = r.employeeId
    if (!empMap.has(key)) {
      empMap.set(key, {
        employeeName: `${r.employee.lastName}, ${r.employee.firstName}`,
        employeeNo: r.employee.employeeNo,
        department: r.employee.department?.name ?? '—',
        tardyDays: 0,
        totalLate: 0,
        totalUndertime: 0,
        absentDays: 0,
      })
    }
    const e = empMap.get(key)!
    const late = Number(r.lateMinutes ?? 0)
    const undertime = Number(r.undertimeMinutes ?? 0)
    if (r.isAbsent) e.absentDays += 1
    if (late > 0 && !r.isAbsent) { e.tardyDays += 1; e.totalLate += late }
    if (undertime > 0) e.totalUndertime += undertime
  }

  const rows = Array.from(empMap.values())
    .filter(r => r.tardyDays > 0 || r.absentDays > 0)
    .map(r => ({
      ...r,
      avgLatePerDay: r.tardyDays > 0 ? r.totalLate / r.tardyDays : 0,
    }))
    .sort((a, b) => b.totalLate - a.totalLate)

  const doc = React.createElement(TardinessReportDocument, {
    companyName: company?.name ?? 'Company',
    weekStart: format(start, 'MMM d, yyyy'),
    weekEnd: format(end, 'MMM d, yyyy'),
    generatedAt: format(new Date(), 'MMM d, yyyy h:mm a'),
    rows,
  })

  const buffer = await renderToBuffer(doc)

  return new NextResponse(buffer, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="tardiness-${weekStart}.pdf"`,
    },
  })
}
