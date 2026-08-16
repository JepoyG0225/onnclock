import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { logAudit } from '@/lib/audit'

const adminRoles = new Set(['SUPER_ADMIN', 'COMPANY_ADMIN', 'HR_MANAGER', 'PAYROLL_OFFICER'])
const schema = z.object({
  category: z.string().min(1), description: z.string().min(3), expenseDate: z.string().min(1),
  amount: z.coerce.number().positive(), receiptUrl: z.string().url().optional().or(z.literal('')),
  receiptFileName: z.string().optional(), isLiquidation: z.boolean().default(false),
  cashAdvanceAmount: z.coerce.number().nonnegative().optional(),
})

export async function GET() {
  const { ctx, error } = await requireAuth(); if (error) return error
  const employee = await prisma.employee.findFirst({ where: { companyId: ctx.companyId, userId: ctx.userId }, select: { id: true } })
  const canViewAll = adminRoles.has(ctx.role)
  const claims = await prisma.expenseClaim.findMany({
    where: { companyId: ctx.companyId, ...(!canViewAll ? { employeeId: employee?.id ?? '__none__' } : {}) },
    include: { employee: { select: { firstName: true, lastName: true, employeeNo: true, department: { select: { name: true } } } } },
    orderBy: { createdAt: 'desc' }, take: 200,
  })
  return NextResponse.json({ claims, canApprove: canViewAll })
}

export async function POST(req: NextRequest) {
  const { ctx, error } = await requireAuth(); if (error) return error
  const employee = await prisma.employee.findFirst({ where: { companyId: ctx.companyId, userId: ctx.userId }, select: { id: true } })
  if (!employee) return NextResponse.json({ error: 'No employee record is linked to this user.' }, { status: 400 })
  const parsed = schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Please complete all required expense fields.', details: parsed.error.flatten() }, { status: 422 })
  const claim = await prisma.expenseClaim.create({ data: {
    companyId: ctx.companyId, employeeId: employee.id, category: parsed.data.category,
    description: parsed.data.description, expenseDate: new Date(parsed.data.expenseDate), amount: parsed.data.amount,
    receiptUrl: parsed.data.receiptUrl || null, receiptFileName: parsed.data.receiptFileName || null,
    isLiquidation: parsed.data.isLiquidation, cashAdvanceAmount: parsed.data.cashAdvanceAmount ?? null,
  } })
  logAudit(ctx, 'CREATE', 'ExpenseClaim', claim.id, { description: `Submitted ${claim.category} expense claim` }).catch(() => {})
  return NextResponse.json({ claim }, { status: 201 })
}
