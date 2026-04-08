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
  const { ctx, error } = await requireAuth(['COMPANY_ADMIN', 'HR_MANAGER', 'PAYROLL_OFFICER'])
  if (error) return error

  const body = await req.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Password must be at least 8 characters.' }, { status: 400 })

  const employee = await prisma.employee.findFirst({
    where: { id, companyId: ctx.companyId },
    select: { id: true, userId: true, workEmail: true, personalEmail: true, firstName: true, lastName: true },
  })
  if (!employee) return NextResponse.json({ error: 'Employee not found' }, { status: 404 })

  const email = employee.workEmail || employee.personalEmail
  if (!email) return NextResponse.json({ error: 'Employee has no email on file' }, { status: 400 })

  const passwordHash = await hash(parsed.data.password, 12)

  // If employee already linked to a user, just update password
  if (employee.userId) {
    await prisma.user.update({
      where: { id: employee.userId },
      data: { passwordHash },
    })
    return NextResponse.json({ success: true, userId: employee.userId })
  }

  // Otherwise, create or link user by email
  let user = await prisma.user.findUnique({ where: { email } })
  if (!user) {
    const name = `${employee.firstName} ${employee.lastName}`.trim()
    user = await prisma.user.create({
      data: { email, name, passwordHash },
    })
  } else {
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash },
    })
  }

  // Ensure membership in company as EMPLOYEE
  await prisma.userCompany.upsert({
    where: { userId_companyId: { userId: user.id, companyId: ctx.companyId } },
    create: { userId: user.id, companyId: ctx.companyId, role: 'EMPLOYEE' },
    update: { role: 'EMPLOYEE' },
  })

  // Link employee to user
  await prisma.employee.update({
    where: { id: employee.id },
    data: { userId: user.id },
  })

  return NextResponse.json({ success: true, userId: user.id })
}
