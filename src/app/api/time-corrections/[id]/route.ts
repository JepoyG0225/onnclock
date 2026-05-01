import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, resolveCompanyIdForRequest } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const reviewSchema = z.object({
  action: z.enum(['approve', 'reject']),
  adminNotes: z.string().optional(),
})

// PATCH — admin approves or rejects
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { ctx, error } = await requireAuth()
  if (error) return error

  if (!['COMPANY_ADMIN', 'SUPER_ADMIN', 'HR_MANAGER', 'DEPARTMENT_HEAD'].includes(ctx.role)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  const companyId = resolveCompanyIdForRequest(ctx, req) ?? ctx.companyId

  const correction = await prisma.timeEntryCorrection.findFirst({
    where: { id, companyId },
    include: { employee: { select: { id: true, companyId: true } } },
  })
  if (!correction) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (correction.status !== 'PENDING') {
    return NextResponse.json({ error: 'This request has already been reviewed.' }, { status: 409 })
  }

  const body = await req.json()
  const parsed = reviewSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
  }

  const { action, adminNotes } = parsed.data
  const newStatus = action === 'approve' ? 'APPROVED' : 'REJECTED'

  // If approving, apply the correction to the DTR record
  if (action === 'approve') {
    const targetDtr = correction.dtrRecordId
      ? await prisma.dTRRecord.findFirst({
          where: { id: correction.dtrRecordId, employeeId: correction.employee.id },
        })
      : await prisma.dTRRecord.findFirst({
          where: { employeeId: correction.employee.id, date: correction.date },
          orderBy: { createdAt: 'desc' },
        })
    const dtr = targetDtr
    if (dtr) {
      const corrDate = correction.date.toISOString().slice(0, 10)

      function toDateTime(timeStr: string | null): Date | null {
        if (!timeStr) return null
        return new Date(`${corrDate}T${timeStr}:00`)
      }

      const newTimeIn  = correction.timeIn  ? toDateTime(correction.timeIn)  : dtr.timeIn
      const newTimeOut = correction.timeOut ? toDateTime(correction.timeOut) : dtr.timeOut
      const newBreakIn  = correction.breakIn  ? toDateTime(correction.breakIn)  : dtr.breakIn
      const newBreakOut = correction.breakOut ? toDateTime(correction.breakOut) : dtr.breakOut

      await prisma.dTRRecord.update({
        where: { id: dtr.id },
        data: {
          ...(newTimeIn  ? { timeIn:  newTimeIn  } : {}),
          ...(newTimeOut !== undefined ? { timeOut: newTimeOut } : {}),
          ...(newBreakIn  !== undefined ? { breakIn:  newBreakIn  } : {}),
          ...(newBreakOut !== undefined ? { breakOut: newBreakOut } : {}),
        },
      })
    }
  }

  const updated = await prisma.timeEntryCorrection.update({
    where: { id },
    data: {
      status: newStatus,
      adminNotes: adminNotes ?? null,
      reviewedBy: ctx.userId,
      reviewedAt: new Date(),
    },
  })

  return NextResponse.json({ correction: updated })
}

// DELETE — employee cancels their own pending request
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { ctx, error } = await requireAuth(undefined, req)
  if (error) return error

  const correction = await prisma.timeEntryCorrection.findFirst({
    where: { id, companyId: ctx.companyId },
  })
  if (!correction) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Employees can only cancel their own pending requests
  const isAdmin = ['COMPANY_ADMIN', 'SUPER_ADMIN', 'HR_MANAGER', 'DEPARTMENT_HEAD'].includes(ctx.role)
  if (!isAdmin) {
    // Resolve employee and verify ownership
    const { resolvePortalEmployeeId } = await import('@/lib/portal-employee')
    const employeeId = await resolvePortalEmployeeId(ctx)
    if (correction.employeeId !== employeeId) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    }
    if (correction.status !== 'PENDING') {
      return NextResponse.json({ error: 'Only pending requests can be cancelled.' }, { status: 409 })
    }
  }

  await prisma.timeEntryCorrection.delete({ where: { id } })
  return NextResponse.json({ success: true })
}
