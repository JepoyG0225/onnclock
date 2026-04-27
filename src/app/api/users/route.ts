import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { hash } from 'bcryptjs'
import { z } from 'zod'

const createUserSchema = z.object({
  name:       z.string().min(1).optional(),
  email:      z.string().email().optional(),
  password:   z.string().min(8),
  role:       z.enum(['COMPANY_ADMIN', 'HR_MANAGER', 'PAYROLL_OFFICER']),
  employeeId: z.string().optional(),
})

export async function GET() {
  const { ctx, error } = await requireAuth(['COMPANY_ADMIN'])
  if (error) return error

  const members = await prisma.userCompany.findMany({
    where: { companyId: ctx.companyId, role: { not: 'EMPLOYEE' } },
    orderBy: { createdAt: 'asc' },
    include: { user: { select: { name: true, email: true } } },
  })

  return NextResponse.json({ members })
}

export async function PATCH(req: NextRequest) {
  const { ctx, error } = await requireAuth(['COMPANY_ADMIN'])
  if (error) return error

  const body = await req.json()
  const { userId, role } = body

  if (!userId || !role) return NextResponse.json({ error: 'userId and role required' }, { status: 400 })

  await prisma.userCompany.updateMany({
    where: { userId, companyId: ctx.companyId },
    data: { role },
  })

  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const { ctx, error } = await requireAuth(['COMPANY_ADMIN'])
  if (error) return error

  const userId = new URL(req.url).searchParams.get('userId')
  if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 })

  const membership = await prisma.userCompany.findFirst({
    where: { userId, companyId: ctx.companyId },
    select: { id: true, role: true },
  })
  if (!membership) {
    return NextResponse.json({ error: 'User not found in this company' }, { status: 404 })
  }
  if (membership.role === 'COMPANY_ADMIN') {
    return NextResponse.json({ error: 'Cannot delete company admin' }, { status: 403 })
  }

  await prisma.userCompany.delete({ where: { id: membership.id } })

  return NextResponse.json({ ok: true })
}

export async function POST(req: NextRequest) {
  const { ctx, error } = await requireAuth(['COMPANY_ADMIN'])
  if (error) return error

  const body = await req.json()
  const parsed = createUserSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
  }

  let { name, email } = parsed.data
  const { password, role, employeeId } = parsed.data

  let employee: { id: string; firstName: string; lastName: string; workEmail: string | null; personalEmail: string | null; userId: string | null } | null = null
  let employeeMembershipRole: 'SUPER_ADMIN' | 'COMPANY_ADMIN' | 'HR_MANAGER' | 'PAYROLL_OFFICER' | 'EMPLOYEE' | null = null
  if (employeeId) {
    employee = await prisma.employee.findFirst({
      where: { id: employeeId, companyId: ctx.companyId, isActive: true },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        workEmail: true,
        personalEmail: true,
        userId: true,
      },
    })
    if (!employee) {
      return NextResponse.json({ error: 'Employee not found' }, { status: 404 })
    }
    if (employee.userId) {
      const existingMembership = await prisma.userCompany.findFirst({
        where: { userId: employee.userId, companyId: ctx.companyId },
        select: { role: true },
      })
      employeeMembershipRole = existingMembership?.role ?? null
      if (employeeMembershipRole === 'COMPANY_ADMIN' || employeeMembershipRole === 'PAYROLL_OFFICER') {
        return NextResponse.json(
          { error: 'Employee is already assigned as Company Admin or Payroll Officer' },
          { status: 409 }
        )
      }
    }
    if (!name) name = `${employee.firstName} ${employee.lastName}`.trim()
    if (!email) email = employee.workEmail || employee.personalEmail || undefined
    if (!email && !employee.userId) {
      return NextResponse.json({ error: 'Employee has no email. Please provide one.' }, { status: 400 })
    }
  }

  if (!name || !email) {
    return NextResponse.json({ error: 'Name and email are required' }, { status: 400 })
  }

  // If employee is already linked, upgrade/create company membership directly.
  if (employee?.userId) {
    const user = await prisma.user.findUnique({ where: { id: employee.userId } })
    if (!user) {
      return NextResponse.json({ error: 'Linked user account not found' }, { status: 404 })
    }

    const passwordHash = await hash(password, 12)
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash, isActive: true, ...(name ? { name } : {}) },
    })

    if (employeeMembershipRole) {
      await prisma.userCompany.updateMany({
        where: { userId: user.id, companyId: ctx.companyId },
        data: { role, isActive: true },
      })
    } else {
      await prisma.userCompany.create({
        data: { userId: user.id, companyId: ctx.companyId, role, isActive: true },
      })
    }

    return NextResponse.json({ ok: true, userId: user.id }, { status: 201 })
  }

  // Check if user already exists
  let user = await prisma.user.findUnique({ where: { email } })

  if (user) {
    // Check if already a member of this company
    const existing = await prisma.userCompany.findFirst({
      where: { userId: user.id, companyId: ctx.companyId },
    })
    if (existing) {
      return NextResponse.json({ error: 'User is already a member of this company' }, { status: 409 })
    }
    // Add existing user to company
    await prisma.userCompany.create({
      data: { userId: user.id, companyId: ctx.companyId, role },
    })
  } else {
    // Create new user and add to company
    const passwordHash = await hash(password, 12)
    user = await prisma.user.create({ data: { email, name, passwordHash } })
    await prisma.userCompany.create({
      data: { userId: user.id, companyId: ctx.companyId, role },
    })
  }

  if (employee) {
    await prisma.employee.update({
      where: { id: employee.id },
      data: { userId: user.id },
    })
  }

  return NextResponse.json({ ok: true, userId: user.id }, { status: 201 })
}
