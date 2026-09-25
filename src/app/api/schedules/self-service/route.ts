import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAuth } from '@/lib/api-auth'
import { logAudit } from '@/lib/audit'
import { prisma } from '@/lib/prisma'

const manageRoles = ['SUPER_ADMIN', 'COMPANY_ADMIN', 'HR_MANAGER']
const updateSchema = z.object({
  enabled: z.boolean(),
  employeeIds: z.array(z.string().min(1)),
})

export async function GET() {
  const { ctx, error } = await requireAuth(manageRoles)
  if (error) return error

  const [company, employees] = await Promise.all([
    prisma.company.findUnique({
      where: { id: ctx.companyId },
      select: { employeeScheduleSelectionEnabled: true },
    }),
    prisma.employee.findMany({
      where: { companyId: ctx.companyId, isActive: true },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      select: {
        id: true,
        employeeNo: true,
        firstName: true,
        lastName: true,
        canSelectOwnSchedule: true,
        department: { select: { name: true } },
        workSchedule: { select: { name: true } },
      },
    }),
  ])

  return NextResponse.json({
    enabled: company?.employeeScheduleSelectionEnabled ?? false,
    employees,
  })
}

export async function PATCH(req: NextRequest) {
  const { ctx, error } = await requireAuth(manageRoles)
  if (error) return error

  const parsed = updateSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid self-scheduling settings.' }, { status: 400 })

  const employeeIds = [...new Set(parsed.data.employeeIds)]
  const matchingEmployees = employeeIds.length
    ? await prisma.employee.findMany({
        where: { companyId: ctx.companyId, isActive: true, id: { in: employeeIds } },
        select: { id: true },
      })
    : []

  if (matchingEmployees.length !== employeeIds.length) {
    return NextResponse.json({ error: 'One or more selected employees are invalid.' }, { status: 400 })
  }

  await prisma.$transaction([
    prisma.company.update({
      where: { id: ctx.companyId },
      data: { employeeScheduleSelectionEnabled: parsed.data.enabled },
    }),
    prisma.employee.updateMany({
      where: { companyId: ctx.companyId, canSelectOwnSchedule: true },
      data: { canSelectOwnSchedule: false },
    }),
    ...(employeeIds.length
      ? [prisma.employee.updateMany({
          where: { companyId: ctx.companyId, isActive: true, id: { in: employeeIds } },
          data: { canSelectOwnSchedule: true },
        })]
      : []),
  ])

  logAudit(ctx, 'UPDATE', 'ScheduleSelfService', ctx.companyId, {
    description: `${parsed.data.enabled ? 'Enabled' : 'Disabled'} employee self-scheduling for ${employeeIds.length} employee(s)`,
    newValues: { enabled: parsed.data.enabled, employeeIds },
  }).catch(() => {})

  return NextResponse.json({ enabled: parsed.data.enabled, employeeIds })
}
