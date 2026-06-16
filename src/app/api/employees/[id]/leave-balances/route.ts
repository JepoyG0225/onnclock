import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/api-auth'

const allocationSchema = z.object({
  leaveTypeId: z.string().min(1),
  entitled: z.coerce.number().min(0),
  enabled: z.boolean(),
})

const saveSchema = z.object({
  allocations: z.array(allocationSchema),
})

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { ctx, error } = await requireAuth()
  if (error) return error

  const employee = await prisma.employee.findFirst({
    where: { id, companyId: ctx.companyId },
    select: { id: true },
  })
  if (!employee) return NextResponse.json({ error: 'Employee not found' }, { status: 404 })

  const year = new Date().getFullYear()

  const [leaveTypes, balances] = await Promise.all([
    prisma.leaveType.findMany({
      where: { companyId: ctx.companyId, isActive: true },
      select: { id: true, name: true, code: true, daysEntitled: true, isMandatory: true, genderRestriction: true },
      orderBy: { name: 'asc' },
    }),
    prisma.leaveBalance.findMany({
      where: { employeeId: id, year },
      select: { id: true, leaveTypeId: true, entitled: true, used: true, pending: true },
    }),
  ])

  return NextResponse.json({ leaveTypes, balances, year })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { ctx, error } = await requireAuth()
  if (error) return error

  const body = await req.json()
  const parsed = saveSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation error', details: parsed.error.flatten() }, { status: 422 })
  }

  const employee = await prisma.employee.findFirst({
    where: { id, companyId: ctx.companyId },
    select: { id: true },
  })
  if (!employee) return NextResponse.json({ error: 'Employee not found' }, { status: 404 })

  const year = new Date().getFullYear()
  const leaveTypes = await prisma.leaveType.findMany({
    where: { companyId: ctx.companyId, isActive: true },
    select: { id: true, daysEntitled: true },
  })
  const allowed = new Map(leaveTypes.map(lt => [lt.id, lt]))

  const allocations = parsed.data.allocations.filter(a => allowed.has(a.leaveTypeId))

  await prisma.$transaction(async (tx) => {
    for (const a of allocations) {
      if (!a.enabled) {
        await tx.leaveBalance.deleteMany({
          where: { employeeId: id, leaveTypeId: a.leaveTypeId, year },
        })
        continue
      }

      const lt = allowed.get(a.leaveTypeId)
      const entitled = Number.isFinite(a.entitled) ? a.entitled : Number(lt?.daysEntitled ?? 0)

      await tx.leaveBalance.upsert({
        where: { employeeId_leaveTypeId_year: { employeeId: id, leaveTypeId: a.leaveTypeId, year } },
        create: { employeeId: id, leaveTypeId: a.leaveTypeId, year, entitled },
        update: { entitled },
      })
    }
  })

  return NextResponse.json({ success: true })
}
