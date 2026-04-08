import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'

export async function POST(req: NextRequest, { params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params
  const { ctx, error } = await requireAuth(['SUPER_ADMIN', 'COMPANY_ADMIN', 'HR_MANAGER'])
  if (error) return error

  const run = await prisma.payrollRun.findFirst({ where: { id: runId, companyId: ctx.companyId } })
  if (!run) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (run.status !== 'FOR_APPROVAL') {
    return NextResponse.json({ error: 'Payroll must be submitted for approval first' }, { status: 400 })
  }

  const approvers = await prisma.approverConfig.findMany({
    where: { companyId: ctx.companyId, type: 'PAYROLL' },
    orderBy: { level: 'asc' },
  })
  const maxLevel = approvers.length
  const currentLevel = run.approvalLevel ?? 0
  const nextLevel = currentLevel + 1
  const expectedApprover = approvers.find(a => a.level === nextLevel)

  if (maxLevel > 0) {
    if (!expectedApprover || expectedApprover.userId !== ctx.userId) {
      return NextResponse.json({ error: 'Not authorized for this approval level' }, { status: 403 })
    }
  }

  const isFinal = maxLevel === 0 || nextLevel >= maxLevel

  const prevTrail = Array.isArray(run.approvalTrail) ? run.approvalTrail : []
  const trailEntry = {
    level: maxLevel > 0 ? nextLevel : 1,
    userId: ctx.userId,
    action: 'approve',
    at: new Date().toISOString(),
  }

  try {
    const updated = await prisma.payrollRun.update({
      where: { id: runId },
      data: {
        approvalLevel: nextLevel,
        approvalTrail: [...prevTrail, trailEntry] as Prisma.InputJsonValue,
        status: isFinal ? 'APPROVED' : 'FOR_APPROVAL',
        approvedBy: isFinal ? ctx.userId : run.approvedBy,
        approvedAt: isFinal ? new Date() : run.approvedAt,
      },
    })
    return NextResponse.json(updated)
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2022') {
      return NextResponse.json(
        { error: 'Database schema is out of date. Run prisma migrate to add approval columns.' },
        { status: 500 },
      )
    }
    throw e
  }
}
