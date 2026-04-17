import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'

const assignmentSchema = z.object({
  incomeTypeId: z.string().min(1),
  isActive: z.boolean(),
  fixedAmount: z.coerce.number().min(0).optional().nullable(),
})

const saveAssignmentsSchema = z.object({
  assignments: z.array(assignmentSchema),
})

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { ctx, error } = await requireAuth()
  if (error) return error

  const employee = await prisma.employee.findFirst({
    where: { id, companyId: ctx.companyId },
    select: { id: true },
  })
  if (!employee) return NextResponse.json({ error: 'Employee not found' }, { status: 404 })

  const [incomeTypes, assignments] = await Promise.all([
    prisma.incomeType.findMany({
      where: { companyId: ctx.companyId, isActive: true },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        code: true,
        mode: true,
        defaultAmount: true,
        isTaxable: true,
      },
    }),
    prisma.employeeIncomeAssignment.findMany({
      where: { employeeId: id },
      select: {
        incomeTypeId: true,
        fixedAmount: true,
        isActive: true,
      },
    }),
  ])

  const assignmentMap = new Map(assignments.map(a => [a.incomeTypeId, a]))

  return NextResponse.json({
    incomeTypes: incomeTypes.map(type => {
      const assignment = assignmentMap.get(type.id)
      return {
        ...type,
        defaultAmount: type.defaultAmount.toNumber(),
        assigned: Boolean(assignment?.isActive),
        fixedAmount: assignment?.fixedAmount != null
          ? assignment.fixedAmount.toNumber()
          : type.defaultAmount.toNumber(),
      }
    }),
  })
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { ctx, error } = await requireAuth()
  if (error) return error

  const body = await req.json().catch(() => null)
  const parsed = saveAssignmentsSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation error', details: parsed.error.flatten() }, { status: 422 })
  }

  const employee = await prisma.employee.findFirst({
    where: { id, companyId: ctx.companyId },
    select: { id: true },
  })
  if (!employee) return NextResponse.json({ error: 'Employee not found' }, { status: 404 })

  const validTypeIds = new Set((await prisma.incomeType.findMany({
    where: { companyId: ctx.companyId, isActive: true },
    select: { id: true },
  })).map(t => t.id))

  for (const assignment of parsed.data.assignments) {
    if (!validTypeIds.has(assignment.incomeTypeId)) {
      return NextResponse.json({ error: 'Invalid income type selected' }, { status: 422 })
    }
  }

  await prisma.$transaction(
    parsed.data.assignments.map(assignment =>
      prisma.employeeIncomeAssignment.upsert({
        where: {
          employeeId_incomeTypeId: {
            employeeId: id,
            incomeTypeId: assignment.incomeTypeId,
          },
        },
        create: {
          employeeId: id,
          incomeTypeId: assignment.incomeTypeId,
          isActive: assignment.isActive,
          fixedAmount: assignment.fixedAmount ?? null,
        },
        update: {
          isActive: assignment.isActive,
          fixedAmount: assignment.fixedAmount ?? null,
        },
      })
    )
  )

  return NextResponse.json({ success: true })
}
