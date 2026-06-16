import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'

const deductionSchema = z.object({
  label: z.string().min(1).max(120),
  amount: z.coerce.number().min(0),
  isActive: z.boolean().optional().default(true),
})

const saveSchema = z.object({
  deductions: z.array(deductionSchema),
})

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const { ctx, error } = await requireAuth()
  if (error) return error

  const employee = await prisma.employee.findFirst({
    where: { id, companyId: ctx.companyId },
    select: { id: true },
  })
  if (!employee) return NextResponse.json({ error: 'Employee not found' }, { status: 404 })

  const rows = await prisma.employeeOtherDeduction.findMany({
    where: { employeeId: id },
    orderBy: { createdAt: 'asc' },
    select: { id: true, label: true, amount: true, isActive: true },
  })

  return NextResponse.json({
    deductions: rows.map(d => ({ id: d.id, label: d.label, amount: d.amount.toNumber(), isActive: d.isActive })),
  })
}

// Replace-set: the posted list becomes the employee's full deduction list.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const { ctx, error } = await requireAuth(['SUPER_ADMIN', 'COMPANY_ADMIN', 'HR_MANAGER', 'PAYROLL_OFFICER'])
  if (error) return error

  const body = await req.json().catch(() => null)
  const parsed = saveSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation error', details: parsed.error.flatten() }, { status: 422 })
  }

  const employee = await prisma.employee.findFirst({
    where: { id, companyId: ctx.companyId },
    select: { id: true },
  })
  if (!employee) return NextResponse.json({ error: 'Employee not found' }, { status: 404 })

  // Keep only non-empty rows; replace the whole set.
  const rows = parsed.data.deductions.filter(d => d.label.trim().length > 0)

  await prisma.$transaction([
    prisma.employeeOtherDeduction.deleteMany({ where: { employeeId: id } }),
    ...(rows.length > 0
      ? [prisma.employeeOtherDeduction.createMany({
          data: rows.map(d => ({
            employeeId: id,
            label: d.label.trim(),
            amount: d.amount,
            isActive: d.isActive ?? true,
          })),
        })]
      : []),
  ])

  return NextResponse.json({ success: true })
}
