import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/api-auth'
import { availableLeave } from '@/lib/leaves/balance'
import { deriveDailyRate } from '@/lib/payroll/rates'
import { ctxHasPermission } from '@/lib/auth/effective-permissions'
import { logAudit } from '@/lib/audit'

const roles = ['COMPANY_ADMIN', 'SUPER_ADMIN', 'HR_MANAGER', 'PAYROLL_OFFICER']
const schema = z.object({
  id: z.string().uuid(), // client-generated idempotency key, reused on retries
  balanceId: z.string().min(1), payrollRunId: z.string().min(1),
  days: z.number().positive().max(366).multipleOf(0.01),
  dailyRate: z.number().positive().max(1000000).multipleOf(0.01),
  isTaxable: z.boolean(), reason: z.string().trim().min(3).max(1000),
})

export async function GET(req: NextRequest) {
  const { ctx, error } = await requireAuth()
  if (error) return error
  if (!roles.includes(ctx.role) || !await ctxHasPermission(ctx, 'payroll:read')) return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  const year = Number(req.nextUrl.searchParams.get('year') ?? new Date().getFullYear())
  if (!Number.isInteger(year) || year < 2000 || year > 2200) return NextResponse.json({ error: 'Invalid year' }, { status: 400 })
  const [balances, runs, entries, config] = await Promise.all([
    prisma.leaveBalance.findMany({ where: { year, employee: { companyId: ctx.companyId, isActive: true }, leaveType: { companyId: ctx.companyId, isPaidOut: true, isActive: true } },
      include: { employee: { include: { workSchedule: true } }, leaveType: true }, orderBy: { employeeId: 'asc' } }),
    prisma.payrollRun.findMany({ where: { companyId: ctx.companyId, status: 'COMPUTED', runType: 'REGULAR', computationStartedAt: null }, orderBy: { periodStart: 'desc' }, select: { id: true, periodLabel: true } }),
    prisma.leaveEncashment.findMany({ where: { companyId: ctx.companyId, balance: { year } }, include: { balance: { include: { employee: { select: { firstName: true, lastName: true } }, leaveType: { select: { name: true } } } }, payrollRun: { select: { id: true, periodLabel: true, status: true, runType: true } } }, orderBy: { createdAt: 'desc' }, take: 200 }),
    prisma.payrollCycleConfig.findUnique({ where: { companyId: ctx.companyId }, select: { workingDaysPerMonth: true } }),
  ])
  return NextResponse.json({ runs, entries, balances: balances.map(b => ({
    id: b.id, employeeId: b.employeeId, isExemptFromTax: b.employee.isExemptFromTax, employee: `${b.employee.employeeNo} — ${b.employee.firstName} ${b.employee.lastName}`, leaveType: b.leaveType.name,
    available: availableLeave(b), encashed: Number(b.encashed),
    dailyRate: Number(deriveDailyRate({ ...b.employee, basicSalary: Number(b.employee.basicSalary), dailyRate: Number(b.employee.dailyRate), hourlyRate: Number(b.employee.hourlyRate) }, {
      workHoursPerDay: Number(b.employee.workSchedule?.workHoursPerDay ?? 8), workingDaysPerMonth: Number(config?.workingDaysPerMonth ?? 22),
    }).toFixed(2)),
  })) })
}

export async function POST(req: NextRequest) {
  const { ctx, error } = await requireAuth()
  if (error) return error
  if (!roles.includes(ctx.role) || !await ctxHasPermission(ctx, 'payroll:write')) return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  const parsed = schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
  const input = parsed.data
  try {
    const entry = await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "payroll_runs" WHERE "id" = ${input.payrollRunId} AND "companyId" = ${ctx.companyId} FOR UPDATE`
      const existing = await tx.leaveEncashment.findUnique({ where: { id: input.id } })
      if (existing) {
        if (existing.companyId !== ctx.companyId || existing.balanceId !== input.balanceId || existing.payrollRunId !== input.payrollRunId || Number(existing.days) !== input.days || Number(existing.dailyRate) !== input.dailyRate || existing.isTaxable !== input.isTaxable || existing.reason !== input.reason) throw new Error('Request id already used for a different encashment')
        return existing
      }
      const run = await tx.payrollRun.findFirst({ where: { id: input.payrollRunId, companyId: ctx.companyId } })
      if (!run || run.status !== 'COMPUTED' || run.runType !== 'REGULAR' || run.computationStartedAt) throw new Error('Choose a computed, unapproved regular payroll that is not being recomputed')
      await tx.$queryRaw`SELECT "id" FROM "leave_balances" WHERE "id" = ${input.balanceId} FOR UPDATE`
      const balance = await tx.leaveBalance.findFirst({ where: { id: input.balanceId, employee: { companyId: ctx.companyId, isActive: true }, leaveType: { companyId: ctx.companyId, isPaidOut: true, isActive: true } }, include: { employee: true } })
      if (!balance) throw new Error('Eligible leave balance not found')
      if (availableLeave(balance) < input.days) throw new Error('Insufficient unreserved leave balance')
      if (run.employeeScopeMode === 'CUSTOM' && !run.employeeIds.includes(balance.employeeId)) throw new Error('Employee is outside this payroll scope')
      if (run.employeeScopeMode === 'EMPLOYMENT_TYPE' && !run.employmentTypeFilter.includes(balance.employee.employmentType)) throw new Error('Employee is outside this payroll scope')
      const name = input.isTaxable ? 'Leave encashment (taxable)' : 'Leave encashment (non-taxable)'
      const incomeType = await tx.incomeType.upsert({ where: { companyId_name: { companyId: ctx.companyId, name } }, update: {}, create: { companyId: ctx.companyId, name, code: 'LEAVE_CASH', mode: 'VARIABLE', isTaxable: input.isTaxable } })
      await tx.leaveBalance.update({ where: { id: balance.id }, data: { encashed: { increment: input.days } } })
      // Invalidate saved totals so this income cannot be omitted during approval.
      await tx.payrollRun.update({ where: { id: run.id }, data: { status: 'DRAFT', approvalLevel: 0, approvalTrail: [] } })
      return tx.leaveEncashment.create({ data: { ...input, companyId: ctx.companyId, approvedBy: ctx.userId, incomeTypeId: incomeType.id, amount: new Prisma.Decimal(input.days).mul(input.dailyRate).toDecimalPlaces(2) } })
    })
    await logAudit(ctx, 'CREATE', 'LeaveEncashment', entry.id, { description: `Approved ${entry.days} days for payroll ${entry.payrollRunId}` }).catch(() => {})
    return NextResponse.json({ entry }, { status: 201 })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unable to encash leave' }, { status: 409 })
  }
}

export async function PATCH(req: NextRequest) {
  const { ctx, error } = await requireAuth()
  if (error) return error
  if (!roles.includes(ctx.role) || !await ctxHasPermission(ctx, 'payroll:write')) return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  const parsed = z.object({ id: z.string().uuid() }).safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid encashment id' }, { status: 400 })
  try {
    await prisma.$transaction(async tx => {
      const entry = await tx.leaveEncashment.findFirst({ where: { id: parsed.data.id, companyId: ctx.companyId } })
      if (!entry) throw new Error('Encashment not found')
      await tx.$queryRaw`SELECT "id" FROM "payroll_runs" WHERE "id" = ${entry.payrollRunId} FOR UPDATE`
      const run = await tx.payrollRun.findUniqueOrThrow({ where: { id: entry.payrollRunId } })
      if (!['DRAFT', 'COMPUTED'].includes(run.status) || run.computationStartedAt) throw new Error('Only encashments in draft or computed payroll can be cancelled')
      if(run.runType==='LEAVE_ENCASHMENT') {
        const batch=await tx.leaveEncashment.findMany({where:{companyId:ctx.companyId,payrollRunId:run.id,status:'APPROVED'},orderBy:{balanceId:'asc'}})
        for(const item of batch) await tx.leaveBalance.update({where:{id:item.balanceId},data:{encashed:{decrement:item.days}}})
        await tx.leaveEncashment.updateMany({where:{companyId:ctx.companyId,payrollRunId:run.id,status:'APPROVED'},data:{status:'CANCELLED',cancelledAt:new Date()}})
        await tx.payslip.deleteMany({where:{payrollRunId:run.id}})
        await tx.payrollRun.update({where:{id:run.id},data:{status:'DRAFT',approvalLevel:0,approvalTrail:[],totalBasic:0,totalGross:0,totalDeductions:0,totalNetPay:0,notes:'Cancelled leave encashment batch. Credits restored; retained for audit.'}})
        return
      }
      const changed = await tx.leaveEncashment.updateMany({ where: { id: entry.id, status: 'APPROVED' }, data: { status: 'CANCELLED', cancelledAt: new Date() } })
      if (changed.count) {
        await tx.leaveBalance.update({ where: { id: entry.balanceId }, data: { encashed: { decrement: entry.days } } })
        await tx.payrollRun.update({ where: { id: run.id }, data: { status: 'DRAFT', approvalLevel: 0, approvalTrail: [] } })
      }
    })
    await logAudit(ctx, 'UPDATE', 'LeaveEncashment', parsed.data.id, { description: 'Cancelled leave encashment and restored days' }).catch(() => {})
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unable to cancel' }, { status: 409 })
  }
}
