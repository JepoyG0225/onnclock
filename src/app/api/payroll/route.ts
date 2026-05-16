import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { getPeriodLabel } from '@/lib/utils'
import { z } from 'zod'

const createRunSchema = z.object({
  periodStart: z.string(),
  periodEnd: z.string(),
  payFrequency: z.enum(['SEMI_MONTHLY', 'MONTHLY', 'WEEKLY', 'DAILY']).optional(),
  payDate: z.string(),
  notes: z.string().optional(),
  // Per-run employee scoping. All three default to "include everyone" so
  // existing clients that don't send these fields keep working unchanged.
  payGroupLabel: z.string().trim().max(120).optional(),
  employeeScopeMode: z.enum(['ALL', 'EMPLOYMENT_TYPE', 'CUSTOM']).optional().default('ALL'),
  employmentTypeFilter: z.array(z.enum(['FULL_TIME', 'PART_TIME', 'CONTRACTUAL'])).optional().default([]),
  employeeIds: z.array(z.string().min(1)).optional().default([]),
})

function atStartOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function generateSemiMonthlyPeriodsForAnchorMonth(
  year: number,
  month: number,
  cfg: {
    firstCutoffStartDay: number
    firstCutoffEndDay: number
    secondCutoffStartDay: number
    secondCutoffEndDay: number
  }
) {
  const buildPeriod = (startDay: number, endDay: number) => {
    if (startDay <= endDay) {
      const endOfMonth = new Date(year, month + 1, 0).getDate()
      return {
        start: atStartOfDay(new Date(year, month, Math.min(startDay, endOfMonth))),
        end: atStartOfDay(new Date(year, month, Math.min(endDay, endOfMonth))),
      }
    }

    const prevYear = month === 0 ? year - 1 : year
    const prevMonth = month === 0 ? 11 : month - 1
    const prevEndOfMonth = new Date(prevYear, prevMonth + 1, 0).getDate()
    const currentEndOfMonth = new Date(year, month + 1, 0).getDate()
    return {
      start: atStartOfDay(new Date(prevYear, prevMonth, Math.min(startDay, prevEndOfMonth))),
      end: atStartOfDay(new Date(year, month, Math.min(endDay, currentEndOfMonth))),
    }
  }

  return [
    buildPeriod(cfg.firstCutoffStartDay, cfg.firstCutoffEndDay),
    buildPeriod(cfg.secondCutoffStartDay, cfg.secondCutoffEndDay),
  ]
}

function matchesConfiguredSemiMonthlyPeriod(
  start: Date,
  end: Date,
  cfg: {
    firstCutoffStartDay: number
    firstCutoffEndDay: number
    secondCutoffStartDay: number
    secondCutoffEndDay: number
  }
) {
  const s = atStartOfDay(start).toISOString().slice(0, 10)
  const e = atStartOfDay(end).toISOString().slice(0, 10)
  const periods = [
    ...generateSemiMonthlyPeriodsForAnchorMonth(end.getFullYear(), end.getMonth() - 1, cfg),
    ...generateSemiMonthlyPeriodsForAnchorMonth(end.getFullYear(), end.getMonth(), cfg),
    ...generateSemiMonthlyPeriodsForAnchorMonth(end.getFullYear(), end.getMonth() + 1, cfg),
  ]
  return periods.some(p => p.start.toISOString().slice(0, 10) === s && p.end.toISOString().slice(0, 10) === e)
}

function getPayrollCycleConfigDelegate() {
  const delegate = (prisma as unknown as {
    payrollCycleConfig?: {
      findUnique: (args: { where: { companyId: string } }) => Promise<{
        payFrequency: 'SEMI_MONTHLY' | 'MONTHLY' | 'WEEKLY' | 'DAILY'
        firstCutoffStartDay: number
        firstCutoffEndDay: number
        secondCutoffStartDay: number
        secondCutoffEndDay: number
        defaultPayDelayDays: number
      } | null>
    }
  }).payrollCycleConfig
  return delegate ?? null
}

async function safeReadPayrollCycleConfig(companyId: string) {
  const delegate = getPayrollCycleConfigDelegate()
  if (!delegate) return null
  try {
    return await delegate.findUnique({
      where: { companyId },
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    const code = e && typeof e === 'object' && 'code' in e ? String((e as { code?: unknown }).code) : ''
    const missingTable = code === 'P2021' || msg.includes('payroll_cycle_configs')
    if (missingTable) return null
    throw e
  }
}

function isSchemaMismatchError(e: unknown) {
  const msg = e instanceof Error ? e.message : String(e)
  const code = e && typeof e === 'object' && 'code' in e ? String((e as { code?: unknown }).code) : ''
  return code === 'P2021' || code === 'P2022' || msg.includes('payroll_cycle_configs') || msg.includes('payroll_runs')
}

export async function GET(req: NextRequest) {
  const { ctx, error } = await requireAuth()
  if (error) return error

  const { searchParams } = new URL(req.url)
  const page = parseInt(searchParams.get('page') || '1')
  const limit = parseInt(searchParams.get('limit') || '20')

  const [runs, total] = await Promise.all([
    prisma.payrollRun.findMany({
      where: { companyId: ctx.companyId },
      orderBy: { periodStart: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.payrollRun.count({ where: { companyId: ctx.companyId } }),
  ])

  return NextResponse.json({ runs, total, page, limit })
}

export async function POST(req: NextRequest) {
  try {
    const { ctx, error } = await requireAuth()
    if (error) return error

    const body = await req.json()
    const parsed = createRunSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation error', details: parsed.error.flatten() }, { status: 422 })
    }

    const companyCycle = await safeReadPayrollCycleConfig(ctx.companyId)

    const { periodStart, periodEnd, payDate, notes, payGroupLabel } = parsed.data
    const payFrequency = parsed.data.payFrequency ?? companyCycle?.payFrequency ?? 'SEMI_MONTHLY'
    const start = new Date(periodStart)
    const end = new Date(periodEnd)
    const payout = new Date(payDate)

    // Normalize scope inputs. Default mode is ALL — unused arrays are cleared
    // so we never silently mix CUSTOM ids with EMPLOYMENT_TYPE filtering.
    const scopeMode = parsed.data.employeeScopeMode ?? 'ALL'
    const employmentTypeFilter = scopeMode === 'EMPLOYMENT_TYPE' ? parsed.data.employmentTypeFilter ?? [] : []
    const employeeIds = scopeMode === 'CUSTOM' ? parsed.data.employeeIds ?? [] : []
    if (scopeMode === 'EMPLOYMENT_TYPE' && employmentTypeFilter.length === 0) {
      return NextResponse.json({ error: 'Select at least one employment type for this run.' }, { status: 422 })
    }
    if (scopeMode === 'CUSTOM' && employeeIds.length === 0) {
      return NextResponse.json({ error: 'Select at least one employee for this run.' }, { status: 422 })
    }

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || Number.isNaN(payout.getTime())) {
      return NextResponse.json({ error: 'Invalid period or pay date' }, { status: 422 })
    }

    if (payFrequency === 'SEMI_MONTHLY' && companyCycle) {
      const isMatch = matchesConfiguredSemiMonthlyPeriod(start, end, {
        firstCutoffStartDay: companyCycle.firstCutoffStartDay,
        firstCutoffEndDay: companyCycle.firstCutoffEndDay,
        secondCutoffStartDay: companyCycle.secondCutoffStartDay,
        secondCutoffEndDay: companyCycle.secondCutoffEndDay,
      })
      if (!isMatch) {
        return NextResponse.json(
          { error: 'Selected period does not match configured semi-monthly cutoffs. Update Payroll Settings or use the suggested period.' },
          { status: 422 }
        )
      }
    }

    let run
    try {
      run = await prisma.payrollRun.create({
        data: {
          companyId: ctx.companyId,
          periodLabel: getPeriodLabel(start, end),
          periodStart: start,
          periodEnd: end,
          payFrequency,
          payDate: payout,
          createdBy: ctx.userId,
          notes,
          payGroupLabel: payGroupLabel?.trim() || null,
          employeeScopeMode: scopeMode,
          employmentTypeFilter,
          employeeIds,
        },
      })
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      const code = e && typeof e === 'object' && 'code' in e ? String((e as { code?: unknown }).code) : 'UNKNOWN'
      if (isSchemaMismatchError(e)) {
        return NextResponse.json(
          {
            error: 'Database schema is outdated for payroll. Apply the latest SQL migration for payroll settings and payroll run fields.',
            detail: msg,
            code,
          },
          { status: 500 }
        )
      }
      return NextResponse.json(
        {
          error: 'Failed to create payroll run',
          detail: msg,
          code,
        },
        { status: 500 }
      )
    }

    return NextResponse.json({ run }, { status: 201 })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    const code = e && typeof e === 'object' && 'code' in e ? String((e as { code?: unknown }).code) : 'UNKNOWN'
    return NextResponse.json({ error: 'Unhandled API error', detail: msg, code }, { status: 500 })
  }
}
