/**
 * GET /api/analytics/overview
 *
 * One-shot company analytics for the HR dashboard:
 *   - Headcount (active vs total, by department, gender split, tenure buckets)
 *   - Hires + separations over last 12 months
 *   - Turnover rate (rolling 12-month)
 *   - Leave utilization (current year so far)
 *   - Attendance trends (last 30 days: avg late mins, avg OT hours)
 *
 * Restricted to HR-level roles. Pure aggregation — no schema changes.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, resolveCompanyIdForRequest } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { requireHrisProOrTrialApi } from '@/lib/hris-pro'

const HR_ROLES = ['COMPANY_ADMIN', 'HR_MANAGER', 'SUPER_ADMIN', 'PAYROLL_OFFICER']

function monthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export async function GET(req: NextRequest) {
  const { ctx, error } = await requireAuth()
  if (error) return error
  if (!HR_ROLES.includes(ctx.role)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  const companyId = resolveCompanyIdForRequest(ctx, req)
  if (!companyId) return NextResponse.json({ error: 'companyId is required' }, { status: 400 })

  const gate = await requireHrisProOrTrialApi(companyId)
  if (gate) return gate

  const now = new Date()
  const yearStart = new Date(now.getFullYear(), 0, 1)
  const twelveMonthsAgo = new Date(now); twelveMonthsAgo.setMonth(now.getMonth() - 12)
  const thirtyDaysAgo = new Date(now); thirtyDaysAgo.setDate(now.getDate() - 30)

  // ── 1. Headcount + demographics ──────────────────────────────────────────
  const employees = await prisma.employee.findMany({
    where: { companyId },
    select: {
      id: true,
      isActive: true,
      gender: true,
      hireDate: true,
      resignationDate: true,
      terminationDate: true,
      employmentStatus: true,
      department: { select: { id: true, name: true } },
    },
  })

  const active = employees.filter((e) => e.isActive)
  const headcountByDept = new Map<string, { name: string; count: number }>()
  for (const e of active) {
    const k = e.department?.id ?? '—'
    const cur = headcountByDept.get(k) ?? { name: e.department?.name ?? 'Unassigned', count: 0 }
    cur.count++
    headcountByDept.set(k, cur)
  }

  const genderSplit = active.reduce(
    (acc, e) => {
      const g = (e.gender ?? '').toUpperCase()
      if (g === 'MALE' || g === 'M') acc.male++
      else if (g === 'FEMALE' || g === 'F') acc.female++
      else acc.other++
      return acc
    },
    { male: 0, female: 0, other: 0 },
  )

  // Tenure buckets (years)
  const tenure = { lt1: 0, y1to3: 0, y3to5: 0, y5to10: 0, gt10: 0 }
  for (const e of active) {
    if (!e.hireDate) continue
    const years = (now.getTime() - new Date(e.hireDate).getTime()) / (1000 * 60 * 60 * 24 * 365.25)
    if (years < 1) tenure.lt1++
    else if (years < 3) tenure.y1to3++
    else if (years < 5) tenure.y3to5++
    else if (years < 10) tenure.y5to10++
    else tenure.gt10++
  }

  // ── 2. Hires + separations by month (last 12) ────────────────────────────
  const hireSeparationByMonth = new Map<string, { hires: number; separations: number }>()
  for (let i = 11; i >= 0; i--) {
    const m = new Date(now); m.setMonth(now.getMonth() - i); m.setDate(1)
    hireSeparationByMonth.set(monthKey(m), { hires: 0, separations: 0 })
  }
  for (const e of employees) {
    if (e.hireDate) {
      const h = new Date(e.hireDate)
      if (h >= twelveMonthsAgo) {
        const k = monthKey(h)
        const r = hireSeparationByMonth.get(k); if (r) r.hires++
      }
    }
    const sepDate = e.resignationDate ?? e.terminationDate
    if (sepDate) {
      const s = new Date(sepDate)
      if (s >= twelveMonthsAgo) {
        const k = monthKey(s)
        const r = hireSeparationByMonth.get(k); if (r) r.separations++
      }
    }
  }
  const hireSeparationTrend = Array.from(hireSeparationByMonth.entries()).map(([month, v]) => ({ month, ...v }))

  // Turnover rate (rolling 12-month): separations / avg headcount * 100
  const totalSeparations12 = hireSeparationTrend.reduce((s, m) => s + m.separations, 0)
  const avgHeadcount = (active.length + employees.length) / 2 || 1
  const turnoverRate = Math.round((totalSeparations12 / avgHeadcount) * 1000) / 10 // 1 decimal

  // ── 3. Leave utilization (this year) ─────────────────────────────────────
  const yearLeaves = await prisma.leaveRequest.findMany({
    where: {
      employee: { companyId },
      status: 'APPROVED',
      startDate: { gte: yearStart },
    },
    select: { totalDays: true, leaveType: { select: { code: true, name: true } } },
  })
  const leaveByType = new Map<string, { name: string; days: number; count: number }>()
  for (const l of yearLeaves) {
    const k = l.leaveType.code
    const cur = leaveByType.get(k) ?? { name: l.leaveType.name, days: 0, count: 0 }
    cur.days += Number(l.totalDays ?? 0)
    cur.count++
    leaveByType.set(k, cur)
  }

  // ── 4. Attendance trends (last 30 days) ──────────────────────────────────
  const dtrs = await prisma.dTRRecord.findMany({
    where: { employee: { companyId }, date: { gte: thirtyDaysAgo }, timeOut: { not: null } },
    select: {
      date: true,
      regularHours: true,
      overtimeHours: true,
      nightDiffHours: true,
      lateMinutes: true,
      undertimeMinutes: true,
    },
  })
  const attendance = dtrs.reduce(
    (acc, d) => {
      acc.totalShifts++
      acc.regularHours += Number(d.regularHours ?? 0)
      acc.overtimeHours += Number(d.overtimeHours ?? 0)
      acc.nightDiffHours += Number(d.nightDiffHours ?? 0)
      acc.lateMinutes += Number(d.lateMinutes ?? 0)
      acc.undertimeMinutes += Number(d.undertimeMinutes ?? 0)
      if (Number(d.lateMinutes ?? 0) > 0) acc.lateShifts++
      return acc
    },
    {
      totalShifts: 0,
      lateShifts: 0,
      regularHours: 0,
      overtimeHours: 0,
      nightDiffHours: 0,
      lateMinutes: 0,
      undertimeMinutes: 0,
    },
  )

  return NextResponse.json({
    generatedAt: now.toISOString(),
    headcount: {
      active: active.length,
      total: employees.length,
      byDepartment: Array.from(headcountByDept.values()).sort((a, b) => b.count - a.count),
      genderSplit,
      tenure,
    },
    hireSeparationTrend,
    turnover: {
      separationsLast12Mo: totalSeparations12,
      averageHeadcount: Math.round(avgHeadcount * 10) / 10,
      ratePercent: turnoverRate,
    },
    leaveUtilization: {
      year: now.getFullYear(),
      totalDays: Array.from(leaveByType.values()).reduce((s, v) => s + v.days, 0),
      byType: Array.from(leaveByType.entries())
        .map(([code, v]) => ({ code, ...v }))
        .sort((a, b) => b.days - a.days),
    },
    attendance30d: {
      ...attendance,
      averageLateMinutesPerShift: attendance.totalShifts > 0
        ? Math.round((attendance.lateMinutes / attendance.totalShifts) * 10) / 10
        : 0,
      lateShiftRatePercent: attendance.totalShifts > 0
        ? Math.round((attendance.lateShifts / attendance.totalShifts) * 1000) / 10
        : 0,
    },
  })
}
