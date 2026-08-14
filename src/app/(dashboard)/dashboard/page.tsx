import { cache } from 'react'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import { resolveEffectiveCompanyId } from '@/lib/effective-company'

const getSession = cache(auth)
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Users, CalendarDays, TrendingUp, AlertCircle, UserCheck, Cake, PlaneTakeoff,
  CheckCircle2, AlarmClock, ListChecks, ArrowRight,
} from 'lucide-react'
import Link from 'next/link'
import { formatCurrency } from '@/lib/utils'
import { PesoIcon } from '@/components/ui/PesoIcon'
import { KpiCard } from '@/components/ui/kpi-card'
import { ctxHasPermission } from '@/lib/auth/effective-permissions'

type BirthdayEmployee = {
  id: string
  firstName: string
  lastName: string
  birthDate: Date | null
  position: { title: string } | null
}

type LeaveEmployeeSummary = {
  firstName: string
  lastName: string
  position: { title: string } | null
}

type LeaveTodayItem = {
  id: string
  employee: LeaveEmployeeSummary
  leaveType: { name: string }
}

export default async function DashboardPage() {
  const session = await getSession()
  if (!session?.user) redirect('/login')

  const companyId = await resolveEffectiveCompanyId(session.user)
  if (!companyId) redirect('/login')
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0)
  const todayEnd   = new Date(); todayEnd.setHours(23, 59, 59, 999)

  let company: { name: string } | null = null
  let totalEmployees = 0
  let activeEmployees = 0
  let pendingLeaves = 0
  let lastPayrollRun: Awaited<ReturnType<typeof prisma.payrollRun.findFirst>> = null
  let clockedInToday = 0
  let upcomingHolidays: Awaited<ReturnType<typeof prisma.holiday.findMany>> = []
  let allEmployeesWithBirthday: BirthdayEmployee[] = []
  let onLeaveToday: LeaveTodayItem[] = []

  try {
    const result = await prisma.$transaction([
      prisma.company.findUnique({
        where: { id: companyId },
        select: { name: true, payrollCurrency: true },
      }),
      prisma.employee.count({ where: { companyId } }),
      prisma.employee.count({ where: { companyId, isActive: true } }),
      prisma.leaveRequest.count({
        where: { status: 'PENDING', employee: { companyId } },
      }),
      prisma.payrollRun.findFirst({
        where: { companyId },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.dTRRecord.count({
        where: {
          employee: { companyId },
          date: { gte: todayStart, lte: todayEnd },
          timeIn: { not: null },
        },
      }),
      prisma.holiday.findMany({
        where: { companyId, date: { gte: todayStart } },
        orderBy: { date: 'asc' },
        take: 5,
      }),
      prisma.employee.findMany({
        where: { companyId, isActive: true, birthDate: { not: undefined } },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          birthDate: true,
          position: { select: { title: true } },
        },
      }),
      prisma.leaveRequest.findMany({
        where: {
          status: 'APPROVED',
          startDate: { lte: todayEnd },
          endDate: { gte: todayStart },
          employee: { companyId, isActive: true },
        },
        include: {
          employee: {
            select: {
              firstName: true,
              lastName: true,
              position: { select: { title: true } },
            },
          },
          leaveType: { select: { name: true } },
        },
        orderBy: { startDate: 'asc' },
        take: 5,
      }),
    ])

    company = result[0]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    totalEmployees = result[1]
    activeEmployees = result[2]
    pendingLeaves = result[3]
    lastPayrollRun = result[4]
    clockedInToday = result[5]
    upcomingHolidays = result[6]
    allEmployeesWithBirthday = result[7]
    onLeaveToday = result[8]
  } catch (error) {
    console.error('Dashboard load failed', error)
  }

  // ── Task stats ─────────────────────────────────────────────────────────
  // Loaded separately from the main transaction so a failure here can't take
  // the whole dashboard down — the task tables are applied by
  // POST /api/admin/run-migrations rather than at build time, so an
  // environment that hasn't had that run would throw.
  //
  // Gated on tasks:read rather than the old beta allow-list: a custom role
  // with tasks:read revoked shouldn't see task counters on its dashboard.
  const showTasks = await ctxHasPermission(
    { userId: session.user.id, companyId, role: session.user.role },
    'tasks:read',
  )
  let taskStats: { open: number; overdue: number; dueThisWeek: number; mine: number } | null = null

  if (showTasks) {
    try {
      const weekAhead = new Date(todayStart)
      weekAhead.setDate(weekAhead.getDate() + 7)

      // The viewer's own employee record, so "My tasks" means theirs.
      const viewerEmployee = await prisma.employee.findFirst({
        where: { companyId, userId: session.user.id },
        select: { id: true },
      })

      const notDone = { companyId, parentTaskId: null, status: { category: { not: 'DONE' as const } } }
      const [open, overdue, dueThisWeek, mine] = await prisma.$transaction([
        prisma.task.count({ where: notDone }),
        prisma.task.count({ where: { ...notDone, dueDate: { lt: todayStart } } }),
        prisma.task.count({ where: { ...notDone, dueDate: { gte: todayStart, lt: weekAhead } } }),
        viewerEmployee
          ? prisma.task.count({
              where: { ...notDone, assignees: { some: { employeeId: viewerEmployee.id } } },
            })
          : prisma.task.count({ where: { id: '__none__' } }),
      ])
      taskStats = { open, overdue, dueThisWeek, mine }
    } catch (error) {
      // Most likely the module's tables aren't migrated in this environment.
      console.error('Dashboard task stats unavailable', error)
      taskStats = null
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const currency = (company as any)?.payrollCurrency ?? 'PHP'
  const peso = (n: number | string | null | undefined) => formatCurrency(n, currency)

  if (!company) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-yellow-500 mx-auto mb-3" />
          <h2 className="text-lg font-semibold">No Company Found</h2>
          <p className="text-gray-500 mt-1">Your account is not associated with any company.</p>
        </div>
      </div>
    )
  }

  const in30Days = new Date(todayStart)
  in30Days.setDate(in30Days.getDate() + 30)

  const upcomingBirthdays = allEmployeesWithBirthday
    .filter((emp) => emp.birthDate !== null)
    .map((emp) => {
      const bd = new Date(emp.birthDate as Date)
      let thisYearBd = new Date(todayStart.getFullYear(), bd.getMonth(), bd.getDate())
      if (thisYearBd < todayStart) {
        thisYearBd = new Date(todayStart.getFullYear() + 1, bd.getMonth(), bd.getDate())
      }
      return { emp, nextBirthday: thisYearBd }
    })
    .filter(({ nextBirthday }) => nextBirthday <= in30Days)
    .sort((a, b) => a.nextBirthday.getTime() - b.nextBirthday.getTime())
    .slice(0, 5)

  const clockInPct = activeEmployees > 0
    ? Math.min(100, Math.round((clockedInToday / activeEmployees) * 100))
    : 0

  const todayLabel = new Date().toLocaleDateString('en-PH', {
    timeZone: 'Asia/Manila', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  })

  // Use Philippine timezone (UTC+8) for greeting
  const phHour = parseInt(new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', hour: 'numeric', hour12: false }).format(new Date()), 10)
  const greeting = phHour < 12 ? 'Good Morning' : phHour < 18 ? 'Good Afternoon' : 'Good Evening'
  const userName = session.user.name?.split(' ')[0] ?? session.user.email?.split('@')[0] ?? ''

  return (
    <div className="space-y-6">

      {/* ── Welcome Banner ──
          Navy rather than the old full-bleed orange. A saturated orange
          block at the top of every page competed with the KPI tiles and the
          "action needed" states underneath it — the brand colour reads much
          louder when it's reserved for things that actually need attention.
          Orange survives as the accent rule and in the CTA. */}
      <div
        className="relative overflow-hidden rounded-2xl p-6 sm:p-7"
        style={{ background: 'linear-gradient(120deg, #ffffff 0%, #f4f9ff 62%, #eaf5ff 100%)', border: '1px solid #dfe7f1' }}
      >
        {/* Soft depth, kept subtle so text contrast never suffers. */}
        <div className="pointer-events-none absolute -right-16 -top-24 h-64 w-64 rounded-full bg-blue-100/50" />
        <div className="pointer-events-none absolute -bottom-20 left-1/3 h-48 w-48 rounded-full bg-cyan-100/30" />
        <div className="pointer-events-none absolute inset-y-0 left-0 w-1" style={{ background: 'var(--brand-highlight)' }} />

        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.15em] text-slate-500">
              {todayLabel}
            </p>
            <h1 className="text-2xl font-bold tracking-tight text-[var(--brand-ink)] sm:text-[28px]">
              {greeting}{userName ? `, ${userName}` : ''}
            </h1>
            <p className="mt-1 text-sm text-slate-500">{company.name}</p>
          </div>

          {/* At-a-glance counts of things waiting on a human. */}
          <div className="flex flex-wrap items-center gap-2">
            {pendingLeaves > 0 && (
              <Link
                href="/leaves"
                className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1.5 text-xs font-medium text-[var(--brand-primary)] transition hover:bg-blue-100"
              >
                <CalendarDays className="h-3.5 w-3.5" />
                {pendingLeaves} leave{pendingLeaves === 1 ? '' : 's'} to review
              </Link>
            )}
            {taskStats && taskStats.overdue > 0 && (
              <Link
                href="/tasks"
                className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold text-white transition hover:opacity-90"
                style={{ background: 'var(--brand-highlight)' }}
              >
                <AlarmClock className="h-3.5 w-3.5" />
                {taskStats.overdue} task{taskStats.overdue === 1 ? '' : 's'} overdue
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* ── Stats Grid ──
          Migrated from hand-rolled inline-style tiles to the shared
          <KpiCard> primitive. Tones are spread (primary/success/warning/
          info) so the dashboard reads as a stat sheet instead of an
          orange wall. The pending-leaves tile uses 'warning' tone +
          a trend line to signal "action needed" without screaming. */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          icon={<Users className="h-5 w-5" />}
          label="Total Employees"
          value={totalEmployees}
          hint={`${activeEmployees} active`}
          tone="primary"
        />
        <KpiCard
          icon={<PesoIcon className="h-5 w-5" />}
          label="Last Payroll"
          value={lastPayrollRun ? peso(Number(lastPayrollRun.totalNetPay)) : '—'}
          hint={lastPayrollRun?.periodLabel}
          tone="success"
        />
        <KpiCard
          icon={<CalendarDays className="h-5 w-5" />}
          label="Pending Leaves"
          value={pendingLeaves}
          tone="warning"
          trend={pendingLeaves > 0 ? { direction: 'flat', text: 'Action needed' } : undefined}
        />
        <KpiCard
          icon={<UserCheck className="h-5 w-5" />}
          label="Clocked In Today"
          value={clockedInToday}
          hint={`${clockInPct}% of active employees`}
          tone="info"
        />
      </div>

      {/* ── Task stats ──
          Rendered as its own band rather than four more tiles in the grid
          above: those are HR/payroll facts about the company, these are work
          items with somewhere to go. Only shown when the module is available
          AND its tables responded — see the guarded query above. */}
      {taskStats && (
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-400">
              Tasks
            </h2>
            <Link
              href="/tasks"
              className="inline-flex items-center gap-1 text-xs font-medium text-gray-500 transition hover:text-gray-900"
            >
              Open board <ArrowRight className="h-3 w-3" />
            </Link>
          </div>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <TaskStat
              href="/tasks?assignee=me"
              icon={<ListChecks className="h-4 w-4" />}
              label="Assigned to me"
              value={taskStats.mine}
              accent="text-[var(--brand-primary)]"
              ring="ring-blue-100"
              bg="bg-blue-50"
            />
            <TaskStat
              href="/tasks"
              icon={<AlarmClock className="h-4 w-4" />}
              label="Overdue"
              value={taskStats.overdue}
              // Only turns red when there's actually something wrong, so a
              // healthy board doesn't look like an alert.
              accent={taskStats.overdue > 0 ? 'text-red-700' : 'text-slate-500'}
              ring={taskStats.overdue > 0 ? 'ring-red-200' : 'ring-slate-200'}
              bg={taskStats.overdue > 0 ? 'bg-red-50' : 'bg-slate-50'}
            />
            <TaskStat
              href="/tasks"
              icon={<CalendarDays className="h-4 w-4" />}
              label="Due this week"
              value={taskStats.dueThisWeek}
              accent="text-cyan-600"
              ring="ring-cyan-100"
              bg="bg-cyan-50"
            />
            <TaskStat
              href="/tasks"
              icon={<CheckCircle2 className="h-4 w-4" />}
              label="Open tasks"
              value={taskStats.open}
              accent="text-[var(--brand-primary)]"
              ring="ring-blue-100"
              bg="bg-blue-50"
            />
          </div>
        </section>
      )}

      {/* ── Remittance Schedules ── */}
      {(() => {
        // Manila "today", derived WITHOUT a parse-as-local round trip.
        //
        // This used to be `new Date(new Date().toLocaleString('en-US', {
        // timeZone: 'Asia/Manila' }))`. That builds a Manila wall-clock
        // string and then re-parses it in the RUNTIME's zone — UTC on the
        // server, +08 in the browser. The two disagreed by 8 hours, so the
        // "Nd left" chips could render differently on each side and React
        // reported a hydration mismatch on every dashboard load.
        //
        // Shifting the epoch and reading UTC parts gives the same Manila
        // calendar date in both environments.
        const manilaNow = new Date(Date.now() + 8 * 60 * 60 * 1000)
        const y = manilaNow.getUTCFullYear()
        const m = manilaNow.getUTCMonth()
        const todayMs = Date.UTC(y, m, manilaNow.getUTCDate())

        // Dates below are built with Date.UTC for the same reason, so
        // comparisons stay in one frame of reference.
        function daysLeft(date: Date) {
          return Math.ceil((date.getTime() - todayMs) / 86400000)
        }
        function fmt(date: Date) {
          return date.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', timeZone: 'UTC' })
        }
        function chip(diff: number) {
          if (diff <= 0)  return { color: '#ef4444', label: 'Due today' }
          if (diff <= 5)  return { color: '#f59e0b', label: `${diff}d left` }
          return           { color: 'var(--brand-primary)', label: `${diff}d left` }
        }

        const schedules = [
          // Date.UTC so these sit in the same frame as todayMs above —
          // mixing local-constructed dates with a UTC baseline reintroduces
          // the off-by-a-day the hydration fix is meant to remove.
          { name: 'SSS',        sub: 'Contribution',    date: new Date(Date.UTC(y, m + 1,  0)) },
          { name: 'PhilHealth', sub: 'Contribution',    date: new Date(Date.UTC(y, m + 1, 10)) },
          { name: 'Pag-IBIG',   sub: 'Contribution',    date: new Date(Date.UTC(y, m + 2,  0)) },
          { name: 'BIR 1601-C', sub: 'Withholding Tax', date: new Date(Date.UTC(y, m + 1, 15)) },
        ]
        const scheduleThemes = [
          { card: '#ffffff', border: '#dfe7f1', title: '#1f2937', sub: '#64748b', accent: '#0b6ffb' },
          { card: '#ffffff', border: '#dfe7f1', title: '#1f2937', sub: '#64748b', accent: '#10b981' },
          { card: '#ffffff', border: '#dfe7f1', title: '#1f2937', sub: '#64748b', accent: '#19c2f2' },
          { card: '#ffffff', border: '#dfe7f1', title: '#1f2937', sub: '#64748b', accent: '#0b6ffb' },
        ]

        return (
          <div>
            <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-400">
              Remittance Schedules
            </h2>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {schedules.map((s, index) => {
                const diff = daysLeft(s.date)
                const { color, label } = chip(diff)
                const theme = scheduleThemes[index]
                const deadlineColor = diff <= 0 ? color : theme.accent
                return (
                  <div key={s.name} className="flex items-center gap-3 rounded-2xl px-4 py-3 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                    style={{ background: theme.card, border: `1px solid ${theme.border}` }}>
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: deadlineColor }} />
                    <div className="min-w-0">
                      <p className="text-sm font-black" style={{ color: theme.title }}>{s.name}</p>
                      <p className="text-[11px]" style={{ color: theme.sub }}>{s.sub}</p>
                      <p className="mt-0.5 text-[11px] font-bold" style={{ color: deadlineColor }}>
                        {fmt(s.date)} · {label}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })()}

      {/* ── Today's Highlights ── */}
      <div>
        <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-400">
          Today&apos;s Highlights
        </h2>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

          {/* Upcoming Birthdays */}
          <Card className="overflow-hidden border-slate-200 bg-white py-0 transition hover:-translate-y-0.5 hover:shadow-lg">
            <CardHeader className="border-b border-slate-100 bg-white px-5 py-4">
              <CardTitle className="flex items-center gap-2 text-sm font-bold !text-[var(--brand-ink)]">
                <div className="rounded-lg bg-blue-50 p-1.5">
                  <Cake className="w-3.5 h-3.5 text-[var(--brand-primary)]" />
                </div>
                Upcoming Birthdays
                <Badge className="ml-auto border-0 bg-blue-50 text-[var(--brand-primary)]">
                  {upcomingBirthdays.length}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="px-5 pb-5">
              {upcomingBirthdays.length === 0 ? (
                <div className="text-center py-8">
                  <Cake className="w-9 h-9 text-gray-200 mx-auto mb-2" />
                  <p className="text-sm text-gray-400">No birthdays in the next 30 days</p>
                </div>
              ) : (
                <div className="space-y-1">
                  {upcomingBirthdays.map(({ emp, nextBirthday }) => {
                    const isToday = nextBirthday.getTime() === todayStart.getTime()
                    const daysUntil = Math.ceil(
                      (nextBirthday.getTime() - todayStart.getTime()) / (1000 * 60 * 60 * 24)
                    )
                    return (
                      <div key={emp.id} className="flex items-center gap-3 p-2 rounded-xl hover:bg-[#f7f7f7] transition-colors">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-50 text-xs font-black text-[var(--brand-primary)] shadow-sm ring-1 ring-blue-100">
                          {emp.firstName[0]}{emp.lastName[0]}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-gray-900 truncate">
                            {emp.firstName} {emp.lastName}
                          </p>
                          <p className="text-xs text-gray-400 truncate">{emp.position?.title || '—'}</p>
                        </div>
                        {isToday ? (
                          <Badge className="border-0 bg-[var(--brand-highlight)] text-black">Today!</Badge>
                        ) : (
                          <span className="text-xs text-gray-400 shrink-0 whitespace-nowrap bg-gray-50 px-2 py-0.5 rounded-full">
                            {daysUntil === 1 ? 'Tomorrow' : `in ${daysUntil}d`}
                          </span>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Upcoming Holidays */}
          <Card className="overflow-hidden border-slate-200 bg-white py-0 transition hover:-translate-y-0.5 hover:shadow-lg">
            <CardHeader className="border-b border-slate-100 bg-white px-5 py-4">
              <CardTitle className="flex items-center gap-2 text-sm font-bold !text-[var(--brand-ink)]">
                <div className="rounded-lg bg-cyan-50 p-1.5">
                  <CalendarDays className="w-3.5 h-3.5 text-cyan-600" />
                </div>
                Upcoming Holidays
                <Badge className="ml-auto border-0 bg-cyan-50 text-cyan-700">
                  {upcomingHolidays.length}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="px-5 pb-5">
              {upcomingHolidays.length === 0 ? (
                <div className="text-center py-8">
                  <CalendarDays className="w-9 h-9 text-gray-200 mx-auto mb-2" />
                  <p className="text-sm text-gray-400">No upcoming holidays</p>
                </div>
              ) : (
                <div className="space-y-1">
                  {upcomingHolidays.map((holiday) => {
                    const hDate = new Date(holiday.date)
                    const daysUntil = Math.ceil(
                      (hDate.getTime() - todayStart.getTime()) / (1000 * 60 * 60 * 24)
                    )
                    return (
                      <div key={holiday.id} className="flex items-center gap-3 p-2 rounded-xl hover:bg-blue-50 transition-colors">
                        <div className="w-9 h-9 rounded-xl bg-[var(--brand-primary)] flex flex-col items-center justify-center shrink-0 shadow-sm">
                          <span className="text-[9px] font-bold text-white/70 uppercase leading-none">
                            {hDate.toLocaleDateString('en-PH', { month: 'short' })}
                          </span>
                          <span className="text-sm font-bold text-white leading-tight">{hDate.getDate()}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-gray-900 truncate">{holiday.name}</p>
                          <Badge
                            className={`mt-0.5 text-[10px] border-0 px-1.5 py-0 h-4 ${
                              holiday.type === 'REGULAR'
                                ? 'bg-red-100 text-red-600'
                                : 'bg-blue-50 text-[var(--brand-primary)]'
                            }`}
                          >
                            {holiday.type === 'REGULAR' ? 'Regular' : 'Special'}
                          </Badge>
                        </div>
                        <span className="text-xs text-gray-400 shrink-0 whitespace-nowrap bg-gray-50 px-2 py-0.5 rounded-full">
                          {daysUntil === 0 ? 'Today' : daysUntil === 1 ? 'Tomorrow' : `in ${daysUntil}d`}
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* On Leave Today */}
          <Card className="overflow-hidden border-slate-200 bg-white py-0 transition hover:-translate-y-0.5 hover:shadow-lg">
            <CardHeader className="border-b border-slate-100 bg-white px-5 py-4">
              <CardTitle className="flex items-center gap-2 text-sm font-bold !text-[var(--brand-ink)]">
                <div className="rounded-lg bg-blue-50 p-1.5">
                  <PlaneTakeoff className="w-3.5 h-3.5 text-[var(--brand-primary)]" />
                </div>
                On Leave Today
                <Badge className="ml-auto border-0 bg-blue-50 text-[var(--brand-primary)]">
                  {onLeaveToday.length}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="px-5 pb-5">
              {onLeaveToday.length === 0 ? (
                <div className="text-center py-8">
                  <PlaneTakeoff className="w-9 h-9 text-gray-200 mx-auto mb-2" />
                  <p className="text-sm text-gray-400">Everyone&apos;s in today</p>
                </div>
              ) : (
                <div className="space-y-1">
                  {onLeaveToday.map((leave) => (
                    <div key={leave.id} className="flex items-center gap-3 p-2 rounded-xl hover:bg-[#d4d4d4]/20 transition-colors">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-50 text-xs font-black text-[var(--brand-primary)] shadow-sm ring-1 ring-blue-100">
                        {leave.employee.firstName[0]}{leave.employee.lastName[0]}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-900 truncate">
                          {leave.employee.firstName} {leave.employee.lastName}
                        </p>
                        <p className="text-xs text-gray-400 truncate">{leave.employee.position?.title || '—'}</p>
                      </div>
                      <Badge className="border-0 bg-blue-50 text-[var(--brand-primary)]">
                        {leave.leaveType.name}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

    </div>
  )
}

/**
 * Compact task metric tile.
 *
 * Deliberately lighter than <KpiCard>: these sit below the payroll/HR stats
 * and shouldn't compete with them for weight. Each one links somewhere, so
 * the number is a starting point rather than a dead end.
 */
function TaskStat({
  href, icon, label, value, accent, ring, bg,
}: {
  href: string
  icon: React.ReactNode
  label: string
  value: number
  accent: string
  ring: string
  bg: string
}) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3.5 shadow-[0_1px_2px_rgba(15,21,25,0.04)] transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-[0_6px_18px_rgba(11,111,251,0.10)]"
    >
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ring-1 ${bg} ${ring} ${accent}`}>
        {icon}
      </span>
      <span className="min-w-0">
        <span className={`block text-xl font-bold leading-none ${accent}`}>{value}</span>
        <span className="mt-1 block truncate text-[11px] font-medium text-gray-500">{label}</span>
      </span>
      <ArrowRight className="ml-auto h-3.5 w-3.5 shrink-0 text-gray-300 transition group-hover:text-gray-500" />
    </Link>
  )
}
