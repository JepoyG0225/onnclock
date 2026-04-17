import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { hash } from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/api-auth'

const schema = z.object({
  password: z.string().min(8),
})

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { ctx, error } = await requireAuth(['SUPER_ADMIN', 'COMPANY_ADMIN', 'HR_MANAGER', 'PAYROLL_OFFICER'])
  if (error) return error

  const body = await req.json().catch(() => ({}))
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Password must be at least 8 characters.' }, { status: 400 })

  try {
    // SUPER_ADMIN may not have a companyId in ctx — find employee by id alone in that case
    const employeeWhere = ctx.companyId
      ? { id, companyId: ctx.companyId }
      : { id }

    const employee = await prisma.employee.findFirst({
      where: employeeWhere,
      select: { id: true, userId: true, workEmail: true, personalEmail: true, firstName: true, lastName: true, companyId: true },
    })
    if (!employee) return NextResponse.json({ error: 'Employee not found' }, { status: 404 })

    const email = employee.workEmail || employee.personalEmail
    if (!email) return NextResponse.json({ error: 'Employee has no email on file' }, { status: 400 })

    const passwordHash = await hash(parsed.data.password, 12)
    // Use the employee's own companyId as fallback (covers SUPER_ADMIN without impersonation)
    const companyId = ctx.companyId || employee.companyId

    // If employee already linked to a user, update password and ensure active
    if (employee.userId) {
      await prisma.user.update({
        where: { id: employee.userId },
        data: { passwordHash, isActive: true },
      })
      // Also ensure the UserCompany membership is active
      await prisma.userCompany.upsert({
        where: { userId_companyId: { userId: employee.userId, companyId } },
        create: { userId: employee.userId, companyId, role: 'EMPLOYEE', isActive: true },
        update: { role: 'EMPLOYEE', isActive: true },
      })
      return NextResponse.json({ success: true, userId: employee.userId })
    }

    // Otherwise, create or link user by email
    let user = await prisma.user.findUnique({ where: { email } })
    if (!user) {
      const name = `${employee.firstName} ${employee.lastName}`.trim()
      user = await prisma.user.create({
        data: { email, name, passwordHash, isActive: true },
      })
    } else {
      await prisma.user.update({
        where: { id: user.id },
        data: { passwordHash, isActive: true },
      })
    }

    // Ensure membership in company as EMPLOYEE — always force isActive:true
    // so that re-issuing portal access un-deactivates the account.
    await prisma.userCompany.upsert({
      where: { userId_companyId: { userId: user.id, companyId } },
      create: { userId: user.id, companyId, role: 'EMPLOYEE', isActive: true },
      update: { role: 'EMPLOYEE', isActive: true },
    })

    // Link employee to user
    await prisma.employee.update({
      where: { id: employee.id },
      data: { userId: user.id },
    })

    return NextResponse.json({ success: true, userId: user.id })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[portal-access POST]', message, err)
    return NextResponse.json({ error: `Server error: ${message}` }, { status: 500 })
  }
}
