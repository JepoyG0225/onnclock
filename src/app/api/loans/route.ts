import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const loanSchema = z.object({
  employeeId: z.string(),
  loanType: z.enum(['SSS_SALARY_LOAN', 'SSS_CALAMITY_LOAN', 'PAGIBIG_MULTI_PURPOSE', 'PAGIBIG_CALAMITY', 'COMPANY_LOAN', 'OTHER']),
  amount: z.number().positive(),
  monthlyAmortization: z.number().positive(),
  startDate: z.string(),
  notes: z.string().optional().nullable(),
})

export async function GET(req: NextRequest) {
  const { ctx, error } = await requireAuth()
  if (error) return error

  const { searchParams } = new URL(req.url)
  const employeeId = searchParams.get('employeeId')
  const status     = searchParams.get('status')
  const page       = Math.max(1, parseInt(searchParams.get('page') ?? '1'))
  const limit      = 50

  const where: Record<string, unknown> = { companyId: ctx.companyId }
  if (employeeId) where.employeeId = employeeId
  if (status)     where.status     = status

  const [loans, total] = await Promise.all([
    prisma.employeeLoan.findMany({
      where,
      include: {
        employee: {
          select: { firstName: true, lastName: true, employeeNo: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.employeeLoan.count({ where }),
  ])

  return NextResponse.json({ loans, total, page })
}

export async function POST(req: NextRequest) {
  const { ctx, error } = await requireAuth()
  if (error) return error

  const body = await req.json()
  const parsed = loanSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const data = parsed.data

  const employee = await prisma.employee.findFirst({
    where: { id: data.employeeId, companyId: ctx.companyId },
  })
  if (!employee) return NextResponse.json({ error: 'Employee not found' }, { status: 404 })

  const loan = await prisma.employeeLoan.create({
    data: {
      companyId:           ctx.companyId,
      employeeId:          data.employeeId,
      loanType:            data.loanType,
      principalAmount:     data.amount,
      balance:             data.amount,
      monthlyAmortization: data.monthlyAmortization,
      startDate:           new Date(data.startDate),
      status:              'ACTIVE',
      notes:               data.notes ?? null,
    },
  })

  return NextResponse.json(loan, { status: 201 })
}
