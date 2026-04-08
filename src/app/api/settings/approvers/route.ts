import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'

// GET — return all eligible users + approver configs grouped by type and level
export async function GET() {
  const { ctx, error } = await requireAuth(['COMPANY_ADMIN'])
  if (error) return error

  const [userCompanies, configs] = await Promise.all([
    prisma.userCompany.findMany({
      where: {
        companyId: ctx.companyId,
        isActive: true,
        role: { in: ['SUPER_ADMIN', 'COMPANY_ADMIN', 'HR_MANAGER', 'PAYROLL_OFFICER'] },
      },
      include: { user: { select: { id: true, name: true, email: true, isActive: true } } },
      orderBy: { user: { name: 'asc' } },
    }),
    prisma.approverConfig.findMany({
      where: { companyId: ctx.companyId },
      orderBy: { level: 'asc' },
    }),
  ])

  const users = userCompanies
    .filter(uc => uc.user.isActive)
    .map(uc => ({
      userId: uc.user.id,
      name:   uc.user.name,
      email:  uc.user.email,
      role:   uc.role,
    }))

  // Return as { type, level, userId }[]
  const approvers = configs.map(c => ({ type: c.type, level: c.level, userId: c.userId }))

  return NextResponse.json({ users, approvers })
}

// POST — set an approver for a specific type+level (upsert)
export async function POST(req: NextRequest) {
  const { ctx, error } = await requireAuth(['COMPANY_ADMIN'])
  if (error) return error

  const { userId, type, level } = await req.json() as {
    userId: string
    type: 'PAYROLL' | 'LEAVE'
    level: number
  }

  if (!userId || !type || !level) {
    return NextResponse.json({ error: 'userId, type, and level required' }, { status: 400 })
  }

  await prisma.approverConfig.upsert({
    where: { companyId_type_level: { companyId: ctx.companyId, type, level } },
    create: { companyId: ctx.companyId, userId, type, level },
    update: { userId },
  })

  return NextResponse.json({ ok: true })
}

// DELETE — remove an approver level
export async function DELETE(req: NextRequest) {
  const { ctx, error } = await requireAuth(['COMPANY_ADMIN'])
  if (error) return error

  const { type, level } = await req.json() as { type: 'PAYROLL' | 'LEAVE'; level: number }

  if (!type || !level) {
    return NextResponse.json({ error: 'type and level required' }, { status: 400 })
  }

  await prisma.approverConfig.deleteMany({
    where: { companyId: ctx.companyId, type, level },
  })

  return NextResponse.json({ ok: true })
}
