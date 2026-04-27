import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { getCompanyPricePerSeat, hasHrisProFeature } from '@/lib/feature-gates'

const HR_ROLES = ['SUPER_ADMIN', 'COMPANY_ADMIN', 'HR_MANAGER']

// GET /api/attendance/screen-captures/latest
// Returns the most recent screenshot for every currently clocked-in employee.
// Used by the Live GPS Map to show latest screenshots in employee detail panels.
export async function GET() {
  const { ctx, error } = await requireAuth()
  if (error) return error

  if (!HR_ROLES.includes(ctx.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const price = await getCompanyPricePerSeat(ctx.companyId)
  if (!hasHrisProFeature(price)) {
    return NextResponse.json({ captures: {} })
  }

  // Find active DTR records (clocked in, not clocked out), including overnight shifts.
  const activeDtrs = await prisma.dTRRecord.findMany({
    where: {
      employee: {
        companyId: ctx.companyId,
        isActive: true,
      },
      timeIn: { not: null },
      timeOut: null,
    },
    select: { id: true, employeeId: true },
  })

  if (activeDtrs.length === 0) {
    return NextResponse.json({ captures: {} })
  }

  const dtrIds = activeDtrs.map(d => d.id)

  // Fetch only the latest screenshot per employee for active DTRs
  const screenshots = await prisma.attendanceScreenshot.findMany({
    where: {
      companyId: ctx.companyId,
      dtrRecordId: { in: dtrIds },
    },
    orderBy: [{ employeeId: 'asc' }, { capturedAt: 'desc' }],
    distinct: ['employeeId'],
    select: {
      id: true,
      employeeId: true,
      imageDataUrl: true,
      capturedAt: true,
    },
  })

  const captures: Record<string, {
    id: string
    imageDataUrl: string
    capturedAt: string
  }> = {}

  for (const s of screenshots) {
    captures[s.employeeId] = {
      id: s.id,
      imageDataUrl: s.imageDataUrl,
      capturedAt: s.capturedAt.toISOString(),
    }
  }

  return NextResponse.json({ captures })
}
