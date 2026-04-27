import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/api-auth'

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { ctx, error } = await requireAuth()
    if (error) return error

    if (!['COMPANY_ADMIN', 'SUPER_ADMIN', 'HR_MANAGER', 'PAYROLL_OFFICER'].includes(ctx.role)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    const { id } = await params
    const assignmentModel = (prisma as unknown as {
      employeeShiftAssignment?: {
        findFirst: (args: unknown) => Promise<{ id: string } | null>
        delete: (args: unknown) => Promise<unknown>
      }
    }).employeeShiftAssignment

    if (assignmentModel?.findFirst) {
      const existing = await assignmentModel.findFirst({
        where: { id, companyId: ctx.companyId },
      })
      if (!existing) return NextResponse.json({ error: 'Assignment not found' }, { status: 404 })
      await assignmentModel.delete({ where: { id } })
    } else {
      const existingRows = await prisma.$queryRaw<Array<{ id: string }>>`
        SELECT "id"
        FROM "employee_shift_assignments"
        WHERE "id" = ${id}
          AND "companyId" = ${ctx.companyId}
        LIMIT 1
      `
      if (!existingRows[0]?.id) {
        return NextResponse.json({ error: 'Assignment not found' }, { status: 404 })
      }

      await prisma.$executeRaw`
        DELETE FROM "employee_shift_assignments"
        WHERE "id" = ${id}
      `
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[DELETE /api/schedules/assignments/[id]]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
