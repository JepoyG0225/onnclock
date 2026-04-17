import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { getPeriodLabel } from '@/lib/utils'

const payrollSettingsSchema = z.object({
  payFrequency: z.enum(['SEMI_MONTHLY', 'MONTHLY', 'WEEKLY', 'DAILY']),
  firstCutoffStartDay: z.coerce.number().int().min(1).max(31),
  firstCutoffEndDay: z.coerce.number().int().min(1).max(31),
  secondCutoffStartDay: z.coerce.number().int().min(1).max(31),
  secondCutoffEndDay: z.coerce.number().int().min(1).max(31),
  defaultPayDelayDays: z.coerce.number().int().min(0).max(60),
})

function atStartOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function addDays(date: Date, days: number) {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
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
      upsert: (args: {
        where: { companyId: string }
        create: {
          companyId: string
          payFrequency: 'SEMI_MONTHLY' | 'MONTHLY' | 'WEEKLY' | 'DAILY'
          firstCutoffStartDay: number
          firstCutoffEndDay: number
          secondCutoffStartDay: number
          secondCutoffEndDay: number
          defaultPayDelayDays: number
        }
        update: {
          payFrequency: 'SEMI_MONTHLY' | 'MONTHLY' | 'WEEKLY' | 'DAILY'
          firstCutoffStartDay: number
          firstCutoffEndDay: number
          secondCutoffStartDay: number
          secondCutoffEndDay: number
          defaultPayDelayDays: number
        }
      }) => Promise<unknown>
    }
  }).payrollCycleConfig
  return delegate ?? null
}

function isMissingPayrollCycleConfigTableError(e: unknown) {
  const msg = e instanceof Error ? e.message : String(e)
  const code = e && typeof e === 'object' && 'code' in e ? String((e as { code?: unknown }).code) : ''
  return code === 'P2021' || msg.includes('payroll_cycle_configs')
}

function isMissingPayrollRunSchemaError(e: unknown) {
  const msg = e instanceof Error ? e.message : String(e)
  const code = e && typeof e === 'object' && 'code' in e ? String((e as { code?: unknown }).code) : ''
  return code === 'P2021' || code === 'P2022' || msg.includes('payroll_runs')
}

async function safeReadPayrollCycleConfig(companyId: string) {
  const delegate = getPayrollCycleConfigDelegate()
  if (!delegate) return null
  try {
    return await delegate.findUnique({ where: { companyId } })
  } catch (e: unknown) {
    if (isMissingPayrollCycleConfigTableError(e)) return null
    throw e
  }
}

async function safeReadLastPayrollRunEnd(companyId: string) {
  try {
    return await prisma.payrollRun.findFirst({
      where: { companyId },
      orderBy: { periodEnd: 'desc' },
      select: { periodEnd: true },
    })
  } catch (e: unknown) {
    if (isMissingPayrollRunSchemaError(e)) return null
    throw e
  }
}

function generateSemiMonthlyPeriods(
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

    // Wrapped cutoff: e.g., 26-10 means previous month 26 up to current month 10.
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

function getNextWeeklyPeriod(reference: Date) {
  const r = atStartOfDay(reference)
  const day = r.getDay()
  const mondayOffset = day === 0 ? -6 : 1 - day
  const start = addDays(r, mondayOffset)
  const end = addDays(start, 6)
  return { start, end }
}

function getNextPeriod(args: {
  payFrequency: 'SEMI_MONTHLY' | 'MONTHLY' | 'WEEKLY' | 'DAILY'
  cfg: {
    firstCutoffStartDay: number
    firstCutoffEndDay: number
    secondCutoffStartDay: number
    secondCutoffEndDay: number
    defaultPayDelayDays: number
  }
  lastRunEnd: Date | null
}) {
  const today = atStartOfDay(new Date())
  const threshold = args.lastRunEnd ? addDays(atStartOfDay(args.lastRunEnd), 1) : today

  if (args.payFrequency === 'DAILY') {
    const start = threshold
    const end = threshold
    return { start, end, payDate: addDays(end, args.cfg.defaultPayDelayDays) }
  }

  if (args.payFrequency === 'WEEKLY') {
    let period = getNextWeeklyPeriod(threshold)
    if (args.lastRunEnd && period.end <= atStartOfDay(args.lastRunEnd)) {
      period = { start: addDays(period.start, 7), end: addDays(period.end, 7) }
    }
    return { start: period.start, end: period.end, payDate: addDays(period.end, args.cfg.defaultPayDelayDays) }
  }

  if (args.payFrequency === 'MONTHLY') {
    const base = threshold
    let start = new Date(base.getFullYear(), base.getMonth(), 1)
    let end = new Date(base.getFullYear(), base.getMonth() + 1, 0)
    if (args.lastRunEnd && end <= atStartOfDay(args.lastRunEnd)) {
      start = new Date(base.getFullYear(), base.getMonth() + 1, 1)
      end = new Date(base.getFullYear(), base.getMonth() + 2, 0)
    }
    start = atStartOfDay(start)
    end = atStartOfDay(end)
    return { start, end, payDate: addDays(end, args.cfg.defaultPayDelayDays) }
  }

  // SEMI_MONTHLY
  const periods = [
    ...generateSemiMonthlyPeriods(threshold.getFullYear(), threshold.getMonth() - 1, args.cfg),
    ...generateSemiMonthlyPeriods(threshold.getFullYear(), threshold.getMonth(), args.cfg),
    ...generateSemiMonthlyPeriods(threshold.getFullYear(), threshold.getMonth() + 1, args.cfg),
    ...generateSemiMonthlyPeriods(threshold.getFullYear(), threshold.getMonth() + 2, args.cfg),
  ]
    .sort((a, b) => a.start.getTime() - b.start.getTime())

  const lastEnd = args.lastRunEnd ? atStartOfDay(args.lastRunEnd) : null
  const candidate = periods.find(p => {
    if (lastEnd) return p.start > lastEnd
    return threshold >= p.start && threshold <= p.end
  }) || periods.find(p => p.start >= threshold) || periods[0]

  return {
    start: candidate.start,
    end: candidate.end,
    payDate: addDays(candidate.end, args.cfg.defaultPayDelayDays),
  }
}

export async function GET() {
  try {
    const { ctx, error } = await requireAuth()
    if (error) return error

    const [config, lastRun] = await Promise.all([
      safeReadPayrollCycleConfig(ctx.companyId),
      safeReadLastPayrollRunEnd(ctx.companyId),
    ])

    const resolved = {
      payFrequency: config?.payFrequency ?? 'SEMI_MONTHLY',
      firstCutoffStartDay: config?.firstCutoffStartDay ?? 1,
      firstCutoffEndDay: config?.firstCutoffEndDay ?? 15,
      secondCutoffStartDay: config?.secondCutoffStartDay ?? 16,
      secondCutoffEndDay: config?.secondCutoffEndDay ?? 31,
      defaultPayDelayDays: config?.defaultPayDelayDays ?? 5,
    } as const

    const next = getNextPeriod({
      payFrequency: resolved.payFrequency,
      cfg: resolved,
      lastRunEnd: lastRun?.periodEnd ?? null,
    })

    return NextResponse.json({
      settings: resolved,
      nextPeriod: {
        periodStart: next.start.toISOString().slice(0, 10),
        periodEnd: next.end.toISOString().slice(0, 10),
        payDate: next.payDate.toISOString().slice(0, 10),
        periodLabel: getPeriodLabel(next.start, next.end),
      },
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    const code = e && typeof e === 'object' && 'code' in e ? String((e as { code?: unknown }).code) : 'UNKNOWN'
    return NextResponse.json({ error: 'Failed to load payroll settings', detail: msg, code }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  const { ctx, error } = await requireAuth()
  if (error) return error

  if (!['SUPER_ADMIN', 'COMPANY_ADMIN', 'HR_MANAGER', 'PAYROLL_OFFICER'].includes(ctx.role)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  const body = await req.json().catch(() => null)
  const parsed = payrollSettingsSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation error', details: parsed.error.flatten() }, { status: 422 })
  }

  const data = parsed.data
  const delegate = getPayrollCycleConfigDelegate()
  if (!delegate) {
    return NextResponse.json(
      { error: 'Payroll settings are unavailable. Run prisma generate and apply latest payroll migrations.' },
      { status: 500 }
    )
  }

  const settings = await delegate.upsert({
    where: { companyId: ctx.companyId },
    create: {
      companyId: ctx.companyId,
      ...data,
    },
    update: {
      ...data,
    },
  })

  return NextResponse.json({ settings })
}
