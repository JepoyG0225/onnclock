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
import { LiveClock } from '@/components/employee/LiveClock'
import { PunchClock } from '@/components/employee/PunchClock'
import { CalendarUserIcon } from '@/components/employee/CalendarUserIcon'
import {
  ListChecks, FileText, CreditCard, ChevronRight, AlertTriangle,
  ClipboardEdit, Banknote, User, CheckCircle2, LogIn, LogOut,
  Timer,
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

  // ONE $transaction rather than five parallel awaits.
  //
  // Firing these concurrently exhausted the connection pool — the pool here is
  // 3 connections and this page wants 5 at once, so every query failed with
  // P2024 "Timed out fetching a new connection" and the whole screen silently
  // rendered zeros. $transaction batches them down a single connection, which
  // is what the admin dashboard already does for the same reason.
  let dtr: { timeIn: Date | null; timeOut: Date | null; breakIn: Date | null; breakOut: Date | null } | null = null
  let pendingLeaves = 0
  let openTasks = 0
  let overdueTasks = 0
  let payslip: { payrollRun: { payDate: Date } } | null = null

  if (employee) {
    const notDone = {
      companyId, parentTaskId: null,
      status: { category: { not: 'DONE' as const } },
      assignees: { some: { employeeId: employee.id } },
    }
    try {
      const [d, leaves, open, overdue, slip] = await withTimeout(
        prisma.$transaction([
          prisma.dTRRecord.findFirst({
            where: { employeeId: employee.id, date: { gte: today, lt: tomorrow } },
            orderBy: { createdAt: 'desc' },
            select: { timeIn: true, timeOut: true, breakIn: true, breakOut: true },
          }),
          prisma.leaveRequest.count({ where: { employeeId: employee.id, status: 'PENDING' } }),
          // Counted unconditionally — a `tasksEnabled` branch inside a
          // $transaction array would change its shape. The cost is one extra
          // count; the numbers are simply not rendered without the entitlement.
          prisma.task.count({ where: notDone }),
          prisma.task.count({ where: { ...notDone, dueDate: { lt: today } } }),
          prisma.payslip.findFirst({
            // Same visibility rule as /api/payroll/my-payslips — there is no
            // PAID status on PayrollRun; a payslip becomes visible once APPROVED.
            where: {
              employeeId: employee.id,
              payrollRun: { companyId, status: { in: ['APPROVED', 'LOCKED'] } },
            },
            orderBy: { createdAt: 'desc' },
            select: { payrollRun: { select: { payDate: true } } },
          }),
        ]),
        6000,
        'portalHome',
      )
      dtr = d
      pendingLeaves = leaves
      openTasks = tasksEnabled ? open : 0
      overdueTasks = tasksEnabled ? overdue : 0
      payslip = slip
    } catch (err) {
      // Degrade to empty cards rather than 500ing the first screen an
      // employee sees.
      console.error(`[portal home] load failed for company ${companyId}:`, err)
    }
  }

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
    : { bg: '#eeeeee', fg: '#343434', dot: '#777777' }

  // Worked hours so far — closed shift uses out-in; an open shift counts to now.
  const workedMs = dtr?.timeIn
    ? (dtr.timeOut ? dtr.timeOut.getTime() : Date.now()) - dtr.timeIn.getTime()
    : 0
  const workedLabel = dtr?.timeIn
    ? `${Math.floor(workedMs / 3600000)}h ${Math.floor((workedMs % 3600000) / 60000)}m`
    : '--'

  const initials = employee
    ? `${employee.firstName[0] ?? ''}${employee.lastName[0] ?? ''}`.toUpperCase()
    : (session.user.name?.[0]?.toUpperCase() ?? 'E')



  return (
    <div className="px-4 py-5 lg:px-8 lg:py-8 max-w-3xl mx-auto space-y-4">

      {/* Greeting + avatar */}
      <header className="flex items-center gap-3">
        <Link href="/portal/profile" className="shrink-0">
          {employee?.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={employee.photoUrl}
              alt=""
              className="w-12 h-12 rounded-2xl object-cover ring-2 ring-white shadow-sm"
            />
          ) : (
            <div
              className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#343434] text-sm font-black text-[var(--brand-highlight)] shadow-sm ring-1 ring-black/10"
            >
              {initials}
            </div>
          )}
        </Link>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold text-slate-400 leading-tight">{greeting()}</p>
          <h1 className="text-[22px] font-black tracking-tight leading-tight truncate" style={{ color: '#000000' }}>
            Hi {firstName}
          </h1>
        </div>
        {/* Status chip with the live clock tucked underneath it, top-right. */}
        <div className="shrink-0 flex flex-col items-end gap-1.5">
          <span
            className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider px-2.5 py-1.5 rounded-full"
            style={{ background: statusTone.bg, color: statusTone.fg }}
          >
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: statusTone.dot }} />
            {statusLabel}
          </span>
          <LiveClock />
        </div>
      </header>

      {/* Attendance — hero punch control */}
      <section className="rounded-3xl bg-white border border-slate-200 shadow-sm p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-[13px] font-black tracking-wide" style={{ color: '#000000' }}>Attendance</h2>
          <Link href="/portal/clock" className="text-[11px] font-bold text-slate-400 hover:text-slate-700 transition-colors">
            History
          </Link>
        </div>

        {/* The real punch control, not a link to it. This is the same component
            /portal/clock renders, so GPS, geofence, biometric verification,
            selfie capture and break handling all behave identically here — and
            cannot drift, because there is only one implementation. */}
        <PunchClock />

        {/* In / Out / Worked */}
        <div className="grid grid-cols-3 gap-2 mt-5">
          {[
            { label: 'Check In',    value: fmtTime(dtr?.timeIn ?? null),  icon: LogIn,  tint: '#059669' },
            { label: 'Check Out',   value: fmtTime(dtr?.timeOut ?? null), icon: LogOut, tint: '#dc2626' },
            { label: 'Working Hrs', value: workedLabel,                   icon: Timer,  tint: '#2563eb' },
          ].map(stat => (
            <div key={stat.label} className="rounded-2xl bg-slate-50 border border-slate-100 px-2.5 py-3 text-center">
              <stat.icon className="w-3.5 h-3.5 mx-auto mb-1.5" style={{ color: stat.tint }} />
              <p className="text-[15px] font-black text-slate-900 tabular-nums leading-none">{stat.value}</p>
              <p className="text-[10px] font-bold text-slate-400 mt-1">{stat.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* At a glance.

          Each card is a single row — icon and label left, count right — rather
          than a stack, which roughly halves the card height. */}
      <section className="grid grid-cols-2 gap-3">
        {tasksEnabled && (
          <Link href="/portal/tasks" className="rounded-2xl bg-white border border-slate-200 shadow-sm px-3.5 py-3 active:scale-[0.99] transition-transform">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
                <ListChecks className="w-4 h-4 text-blue-600" />
              </div>
              <p className="text-[11px] font-bold text-slate-400 leading-tight flex-1 min-w-0">
                Open task{openTasks === 1 ? '' : 's'}
              </p>
              <p className="text-xl font-black text-slate-900 leading-none tabular-nums">{openTasks}</p>
            </div>
            {overdueTasks > 0 && (
              <p className="text-[10px] font-black text-red-600 mt-1.5 inline-flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" />
                {overdueTasks} overdue
              </p>
            )}
          </Link>
        )}

        <Link href="/portal/leaves" className="rounded-2xl bg-white border border-slate-200 shadow-sm px-3.5 py-3 active:scale-[0.99] transition-transform">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-violet-50 flex items-center justify-center shrink-0">
              <FileText className="w-4 h-4 text-violet-600" />
            </div>
            <p className="text-[11px] font-bold text-slate-400 leading-tight flex-1 min-w-0">
              Pending leave{pendingLeaves === 1 ? '' : 's'}
            </p>
            <p className="text-xl font-black text-slate-900 leading-none tabular-nums">{pendingLeaves}</p>
          </div>
        </Link>

        <Link
          href="/portal/payslips"
          className={`rounded-2xl bg-white border border-slate-200 shadow-sm px-3.5 py-3 active:scale-[0.99] transition-transform ${tasksEnabled ? 'col-span-2' : ''}`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-emerald-50 flex items-center justify-center">
                <CreditCard className="w-4 h-4 text-emerald-600" />
              </div>
              <div>
                <p className="text-[11px] font-bold text-slate-400">Latest payslip</p>
                <p className="text-[15px] font-black text-slate-900 leading-tight mt-0.5">
                  {payslip?.payrollRun?.payDate
                    ? new Intl.DateTimeFormat('en-US', { timeZone: MANILA_TIME_ZONE, month: 'short', day: 'numeric', year: 'numeric' })
                        .format(payslip.payrollRun.payDate)
                    : 'None yet'}
                </p>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-slate-300" />
          </div>
        </Link>
      </section>

      {/* More actions */}
      <section>
        <h2 className="text-[11px] font-black uppercase tracking-wider text-slate-400 mb-2.5 px-1">
          More actions
        </h2>
        <div className="rounded-3xl bg-white border border-slate-200 shadow-sm overflow-hidden divide-y divide-slate-100">
          {[
            { href: '/portal/leaves/new',       label: 'Request leave',        icon: CalendarUserIcon, tint: 'text-violet-600 bg-violet-50' },
            { href: '/portal/time-corrections', label: 'Fix a time entry',     icon: ClipboardEdit, tint: 'text-amber-600 bg-amber-50' },
            { href: '/portal/cash-advance',     label: 'Request cash advance', icon: Banknote,      tint: 'text-emerald-600 bg-emerald-50' },
            { href: '/portal/profile',          label: 'My profile',           icon: User,          tint: 'text-slate-600 bg-slate-100' },
          ].map(item => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-3 px-4 py-3.5 active:bg-slate-50 transition-colors"
            >
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${item.tint}`}>
                <item.icon className="w-4 h-4" />
              </div>
              <span className="text-[13px] font-bold text-slate-800 flex-1">{item.label}</span>
              <ChevronRight className="w-4 h-4 text-slate-300" />
            </Link>
          ))}
        </div>
      </section>

      {openTasks === 0 && pendingLeaves === 0 && (
        <div className="flex items-center justify-center gap-2 py-2 text-slate-400">
          <CheckCircle2 className="w-4 h-4" />
          <span className="text-[11px] font-bold">Nothing needs your attention right now</span>
        </div>
      )}
    </div>
  )
}


