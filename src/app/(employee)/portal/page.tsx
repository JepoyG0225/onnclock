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
  Fingerprint, MapPin, Timer,
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
    : { bg: '#f1f5f9', fg: '#475569', dot: '#94a3b8' }

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

  const punchLabel = onBreak ? 'ON BREAK' : clockedIn ? 'PUNCH OUT' : clockedOut ? 'VIEW DAY' : 'PUNCH IN'

  // Punch ring uses brand orange when the next action is to clock in, and the
  // navy→teal pair once a shift is running, so the control reads differently at
  // a glance without introducing a colour outside the theme.
  const punchFill = clockedIn || onBreak
    ? 'linear-gradient(145deg, #1b6a6e, #032b63)'
    : 'linear-gradient(145deg, #ff5900, #e04e00)'
  const punchGlow = clockedIn || onBreak
    ? 'rgba(27,106,110,0.30)'
    : 'rgba(255,89,0,0.30)'

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
              className="w-12 h-12 rounded-2xl flex items-center justify-center text-sm font-black text-white shadow-sm"
              style={{ background: 'linear-gradient(135deg, #032b63, #1b6a6e)' }}
            >
              {initials}
            </div>
          )}
        </Link>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold text-slate-400 leading-tight">{greeting()}</p>
          <h1 className="text-[22px] font-black tracking-tight leading-tight truncate" style={{ color: '#032b63' }}>
            Hi {firstName}
          </h1>
        </div>
        <span
          className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider px-2.5 py-1.5 rounded-full shrink-0"
          style={{ background: statusTone.bg, color: statusTone.fg }}
        >
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: statusTone.dot }} />
          {statusLabel}
        </span>
      </header>

      {/* Attendance — hero punch control */}
      <section className="rounded-3xl bg-white border border-slate-200 shadow-sm p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-[13px] font-black tracking-wide" style={{ color: '#032b63' }}>Attendance</h2>
          <Link href="/portal/clock" className="text-[11px] font-bold text-slate-400 hover:text-slate-700 transition-colors">
            History
          </Link>
        </div>
        <p className="text-[11px] font-semibold text-slate-400 mt-0.5 mb-5">
          {new Intl.DateTimeFormat('en-US', {
            timeZone: MANILA_TIME_ZONE, weekday: 'long', month: 'short', day: 'numeric',
          }).format(new Date())}
        </p>

        {/* Links to /portal/clock rather than punching here: the real action
            needs GPS and, for some companies, a selfie capture, all of which
            live on the clock screen. Keeping this a link keeps the home a fast
            server-rendered page and one source of truth for the clock rules. */}
        <Link href="/portal/clock" className="block">
          <div className="relative mx-auto w-[176px] h-[176px] flex items-center justify-center">
            <span
              className="absolute inset-0 rounded-full"
              style={{ background: `radial-gradient(circle, ${punchGlow} 0%, transparent 68%)` }}
            />
            <span className="absolute inset-3 rounded-full border border-slate-200" />
            <div
              className="relative w-[132px] h-[132px] rounded-full flex flex-col items-center justify-center gap-1.5 active:scale-95 transition-transform"
              style={{ background: punchFill, boxShadow: `0 14px 34px ${punchGlow}` }}
            >
              <Fingerprint className="w-7 h-7 text-white" strokeWidth={1.7} />
              <span className="text-[11px] font-black tracking-[0.15em] text-white">
                {punchLabel}
              </span>
            </div>
          </div>
        </Link>

        <p className="flex items-center justify-center gap-1.5 text-[11px] font-semibold text-slate-400 mt-4">
          <MapPin className="w-3 h-3" />
          Location is captured when you punch
        </p>

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

      {/* At a glance */}
      <section className="grid grid-cols-2 gap-3">
        {tasksEnabled && (
          <Link href="/portal/tasks" className="rounded-3xl bg-white border border-slate-200 shadow-sm p-4 active:scale-[0.99] transition-transform">
            <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center mb-3">
              <ListChecks className="w-4 h-4 text-blue-600" />
            </div>
            <p className="text-2xl font-black text-slate-900 leading-none tabular-nums">{openTasks}</p>
            <p className="text-[11px] font-bold text-slate-400 mt-1">
              Open task{openTasks === 1 ? '' : 's'}
            </p>
            {overdueTasks > 0 && (
              <p className="text-[11px] font-black text-red-600 mt-1.5 inline-flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" />
                {overdueTasks} overdue
              </p>
            )}
          </Link>
        )}

        <Link href="/portal/leaves" className="rounded-3xl bg-white border border-slate-200 shadow-sm p-4 active:scale-[0.99] transition-transform">
          <div className="w-9 h-9 rounded-xl bg-violet-50 flex items-center justify-center mb-3">
            <FileText className="w-4 h-4 text-violet-600" />
          </div>
          <p className="text-2xl font-black text-slate-900 leading-none tabular-nums">{pendingLeaves}</p>
          <p className="text-[11px] font-bold text-slate-400 mt-1">
            Pending leave{pendingLeaves === 1 ? '' : 's'}
          </p>
        </Link>

        <Link
          href="/portal/payslips"
          className={`rounded-3xl bg-white border border-slate-200 shadow-sm p-4 active:scale-[0.99] transition-transform ${tasksEnabled ? 'col-span-2' : ''}`}
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
            { href: '/portal/leaves/new',       label: 'Request leave',        icon: FileText,      tint: 'text-violet-600 bg-violet-50' },
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


