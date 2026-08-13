/**
 * Portal home.
 *
 * This route used to `redirect('/portal/clock')`, so employees landed straight
 * on the clock with no sense of what else needed their attention. It is now a
 * real home — but the clock action stays at the very top and is a single tap,
 * so the most common daily action did not get further away.
 *
 * Every load is wrapped in allSettled + a hard timeout, matching the portal
 * layout: a slow or failing query degrades that one card to an empty state
 * rather than 500ing the first screen an employee sees.
 */
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getEmployeeLiteByUser } from '@/lib/data/employee'
import { getCompanySubscription, hasHrisProFeature } from '@/lib/feature-gates'
import { getManilaDateOnly, MANILA_TIME_ZONE } from '@/lib/date-manila'
import {
  ListChecks, FileText, CreditCard, ChevronRight, AlertTriangle,
  ClipboardEdit, Banknote, User, CheckCircle2, LogIn, LogOut,
} from 'lucide-react'

export const dynamic = 'force-dynamic'

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout (${ms}ms): ${label}`)), ms),
    ),
  ])
}

/** Greeting keyed to Manila time — the server runs in UTC on Vercel. */
function greeting(): string {
  const hour = Number(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: MANILA_TIME_ZONE, hour: '2-digit', hour12: false,
    }).format(new Date()),
  )
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

function fmtTime(d: Date | null): string {
  if (!d) return '--:--'
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: MANILA_TIME_ZONE, hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(d)
}

export default async function PortalHomePage() {
  const session = await auth()
  if (!session?.user) redirect('/portal/login')

  const companyId = session.user.companyId
  if (!companyId) redirect('/portal/clock')

  const employee = await getEmployeeLiteByUser(session.user.id, companyId)

  // Manila "today" — the DTR date column is a calendar date in PH time, so
  // deriving the day from the server's UTC clock would roll over 8 hours early.
  const today = getManilaDateOnly()
  const tomorrow = new Date(today)
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1)

  const sub = await getCompanySubscription(companyId).catch(() => ({ pricePerSeat: 0, isTrial: false }))
  const tasksEnabled = hasHrisProFeature(sub.pricePerSeat) || sub.isTrial

  const results = await Promise.allSettled([
    employee
      ? withTimeout(prisma.dTRRecord.findFirst({
          where: { employeeId: employee.id, date: { gte: today, lt: tomorrow } },
          orderBy: { createdAt: 'desc' },
          select: { timeIn: true, timeOut: true, breakIn: true, breakOut: true },
        }), 4000, 'todayDtr')
      : Promise.resolve(null),
    employee
      ? withTimeout(prisma.leaveRequest.count({
          where: { employeeId: employee.id, status: 'PENDING' },
        }), 4000, 'pendingLeaves')
      : Promise.resolve(0),
    // Task counters. Guarded by the Pro check above so non-entitled companies
    // don't pay for these queries at all.
    tasksEnabled && employee
      ? withTimeout(prisma.task.count({
          where: {
            companyId, parentTaskId: null,
            status: { category: { not: 'DONE' } },
            assignees: { some: { employeeId: employee.id } },
          },
        }), 4000, 'openTasks')
      : Promise.resolve(0),
    tasksEnabled && employee
      ? withTimeout(prisma.task.count({
          where: {
            companyId, parentTaskId: null,
            status: { category: { not: 'DONE' } },
            assignees: { some: { employeeId: employee.id } },
            dueDate: { lt: today },
          },
        }), 4000, 'overdueTasks')
      : Promise.resolve(0),
    employee
      ? withTimeout(prisma.payslip.findFirst({
          // Same visibility rule as /api/payroll/my-payslips — there is no PAID
          // status on PayrollRun; a payslip becomes visible once APPROVED.
          where: {
            employeeId: employee.id,
            payrollRun: { companyId, status: { in: ['APPROVED', 'LOCKED'] } },
          },
          orderBy: { createdAt: 'desc' },
          select: { payrollRun: { select: { payDate: true } } },
        }), 4000, 'latestPayslip')
      : Promise.resolve(null),
  ])

  const dtr           = results[0].status === 'fulfilled' ? results[0].value : null
  const pendingLeaves = results[1].status === 'fulfilled' ? (results[1].value as number) : 0
  const openTasks     = results[2].status === 'fulfilled' ? (results[2].value as number) : 0
  const overdueTasks  = results[3].status === 'fulfilled' ? (results[3].value as number) : 0
  const payslip       = results[4].status === 'fulfilled' ? results[4].value : null

  results.forEach((r, i) => {
    if (r.status === 'rejected') {
      const which = ['todayDtr', 'pendingLeaves', 'openTasks', 'overdueTasks', 'latestPayslip'][i]
      console.error(`[portal home] ${which} failed for company ${companyId}:`, r.reason)
    }
  })

  const clockedIn  = !!dtr?.timeIn && !dtr?.timeOut
  const clockedOut = !!dtr?.timeIn && !!dtr?.timeOut
  const onBreak    = !!dtr?.breakIn && !dtr?.breakOut

  const firstName = employee?.firstName ?? session.user.name?.split(' ')[0] ?? 'there'

  const statusLabel = onBreak ? 'On break'
    : clockedIn ? 'Clocked in'
    : clockedOut ? 'Shift complete'
    : 'Not clocked in'

  const statusTone = onBreak ? { bg: '#fffbeb', fg: '#b45309', dot: '#f59e0b' }
    : clockedIn ? { bg: '#ecfdf5', fg: '#047857', dot: '#10b981' }
    : clockedOut ? { bg: '#eff6ff', fg: '#1d4ed8', dot: '#3b82f6' }
    : { bg: '#f8fafc', fg: '#475569', dot: '#94a3b8' }

  return (
    <div className="px-4 py-5 lg:px-8 lg:py-8 max-w-3xl mx-auto space-y-5">

      {/* Greeting */}
      <header>
        <p className="text-sm font-semibold text-slate-500">{greeting()},</p>
        <h1 className="text-[26px] lg:text-3xl font-black text-slate-900 tracking-tight leading-tight">
          {firstName}
        </h1>
        <p className="text-xs text-slate-400 mt-1 font-medium">
          {new Intl.DateTimeFormat('en-US', {
            timeZone: MANILA_TIME_ZONE, weekday: 'long', month: 'long', day: 'numeric',
          }).format(new Date())}
        </p>
      </header>

      {/* Today / clock — the primary action, kept one tap from the landing screen */}
      <Link
        href="/portal/clock"
        className="block rounded-3xl bg-white border border-slate-200 p-5 shadow-sm active:scale-[0.99] transition-transform"
      >
        <div className="flex items-center justify-between mb-4">
          <span
            className="inline-flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full"
            style={{ background: statusTone.bg, color: statusTone.fg }}
          >
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: statusTone.dot }} />
            {statusLabel}
          </span>
          <ChevronRight className="w-4 h-4 text-slate-300" />
        </div>

        <div className="flex items-stretch gap-3">
          <div className="flex-1 rounded-2xl bg-slate-50 px-3 py-2.5">
            <div className="flex items-center gap-1.5 mb-1">
              <LogIn className="w-3 h-3 text-emerald-500" />
              <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">In</span>
            </div>
            <p className="text-lg font-black text-slate-900 tabular-nums leading-none">
              {fmtTime(dtr?.timeIn ?? null)}
            </p>
          </div>
          <div className="flex-1 rounded-2xl bg-slate-50 px-3 py-2.5">
            <div className="flex items-center gap-1.5 mb-1">
              <LogOut className="w-3 h-3 text-slate-400" />
              <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Out</span>
            </div>
            <p className="text-lg font-black text-slate-900 tabular-nums leading-none">
              {fmtTime(dtr?.timeOut ?? null)}
            </p>
          </div>
        </div>

        <div
          className="mt-4 w-full rounded-2xl py-3 text-center text-sm font-black text-white"
          style={{ background: clockedIn || onBreak ? '#0f172a' : '#ff5900' }}
        >
          {clockedIn || onBreak ? 'Open time clock' : clockedOut ? 'View today’s record' : 'Clock in'}
        </div>
      </Link>

      {/* At a glance */}
      <section className="grid grid-cols-2 gap-3">
        {tasksEnabled && (
          <Link
            href="/portal/tasks"
            className="rounded-3xl bg-white border border-slate-200 p-4 active:scale-[0.99] transition-transform"
          >
            <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center mb-3">
              <ListChecks className="w-4 h-4 text-blue-600" />
            </div>
            <p className="text-2xl font-black text-slate-900 leading-none tabular-nums">{openTasks}</p>
            <p className="text-xs font-semibold text-slate-500 mt-1">
              Open task{openTasks === 1 ? '' : 's'}
            </p>
            {overdueTasks > 0 && (
              <p className="text-[11px] font-bold text-red-600 mt-1.5 inline-flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" />
                {overdueTasks} overdue
              </p>
            )}
          </Link>
        )}

        <Link
          href="/portal/leaves"
          className="rounded-3xl bg-white border border-slate-200 p-4 active:scale-[0.99] transition-transform"
        >
          <div className="w-9 h-9 rounded-xl bg-violet-50 flex items-center justify-center mb-3">
            <FileText className="w-4 h-4 text-violet-600" />
          </div>
          <p className="text-2xl font-black text-slate-900 leading-none tabular-nums">{pendingLeaves}</p>
          <p className="text-xs font-semibold text-slate-500 mt-1">
            Pending leave{pendingLeaves === 1 ? '' : 's'}
          </p>
        </Link>

        <Link
          href="/portal/payslips"
          className={`rounded-3xl bg-white border border-slate-200 p-4 active:scale-[0.99] transition-transform ${tasksEnabled ? 'col-span-2' : ''}`}
        >
          <div className="flex items-center justify-between">
            <div>
              <div className="w-9 h-9 rounded-xl bg-emerald-50 flex items-center justify-center mb-3">
                <CreditCard className="w-4 h-4 text-emerald-600" />
              </div>
              <p className="text-xs font-semibold text-slate-500">Latest payslip</p>
              <p className="text-lg font-black text-slate-900 leading-tight mt-0.5">
                {payslip?.payrollRun?.payDate
                  ? new Intl.DateTimeFormat('en-US', { timeZone: MANILA_TIME_ZONE, month: 'short', day: 'numeric', year: 'numeric' })
                      .format(payslip.payrollRun.payDate)
                  : 'None yet'}
              </p>
            </div>
            <ChevronRight className="w-4 h-4 text-slate-300" />
          </div>
        </Link>
      </section>

      {/* Quick actions */}
      <section>
        <h2 className="text-xs font-black uppercase tracking-wider text-slate-400 mb-2.5 px-1">
          Quick actions
        </h2>
        <div className="rounded-3xl bg-white border border-slate-200 overflow-hidden divide-y divide-slate-100">
          {[
            { href: '/portal/leaves/new',        label: 'Request leave',        icon: FileText,      tint: 'text-violet-600 bg-violet-50' },
            { href: '/portal/time-corrections',  label: 'Fix a time entry',     icon: ClipboardEdit, tint: 'text-amber-600 bg-amber-50' },
            { href: '/portal/cash-advance',      label: 'Request cash advance', icon: Banknote,      tint: 'text-emerald-600 bg-emerald-50' },
            { href: '/portal/profile',           label: 'My profile',           icon: User,          tint: 'text-slate-600 bg-slate-100' },
          ].map(item => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-3 px-4 py-3.5 active:bg-slate-50 transition-colors"
            >
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${item.tint}`}>
                <item.icon className="w-4 h-4" />
              </div>
              <span className="text-sm font-bold text-slate-800 flex-1">{item.label}</span>
              <ChevronRight className="w-4 h-4 text-slate-300" />
            </Link>
          ))}
        </div>
      </section>

      {/* All-clear note, so an empty home doesn't read as broken */}
      {openTasks === 0 && pendingLeaves === 0 && (
        <div className="flex items-center justify-center gap-2 py-2 text-slate-400">
          <CheckCircle2 className="w-4 h-4" />
          <span className="text-xs font-semibold">Nothing needs your attention right now</span>
        </div>
      )}
    </div>
  )
}
