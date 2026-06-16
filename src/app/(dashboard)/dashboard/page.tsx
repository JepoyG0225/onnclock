import { cache } from 'react'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import { resolveEffectiveCompanyId } from '@/lib/effective-company'

const getSession = cache(auth)
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Users, CalendarDays, TrendingUp, AlertCircle, UserCheck, Cake, PlaneTakeoff } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { PesoIcon } from '@/components/ui/PesoIcon'
import { KpiCard } from '@/components/ui/kpi-card'

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

      {/* ── Welcome Banner ── */}
      <div className="rounded-2xl p-6 relative overflow-hidden"
        style={{ background: 'linear-gradient(135deg, #ff5900 0%, #ff7a2e 100%)', boxShadow: '0 4px 20px rgba(255,89,0,0.3)' }}>
        <div className="absolute -right-8 -top-8 w-48 h-48 rounded-full" style={{ background: 'rgba(255,255,255,0.08)' }} />
        <div className="absolute right-24 bottom-0 w-32 h-32 rounded-full" style={{ background: 'rgba(255,255,255,0.05)' }} />
        <div className="absolute -left-6 -bottom-6 w-36 h-36 rounded-full" style={{ background: 'rgba(0,0,0,0.06)' }} />
        <div className="relative">
          <p className="text-xs font-semibold uppercase tracking-widest mb-1 text-white/70">{todayLabel}</p>
          <h1 className="text-2xl font-bold text-white">{greeting}{userName ? `, ${userName}!` : '!'}</h1>
          <p className="text-sm mt-0.5 text-white/60">{company.name}</p>
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
          tone={pendingLeaves > 0 ? 'warning' : 'neutral'}
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

      {/* ── Remittance Schedules ── */}
      {(() => {
        const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Manila' }))
        const y = now.getFullYear()
        const m = now.getMonth()
        const todayMs = new Date(y, now.getMonth(), now.getDate()).getTime()

        function daysLeft(date: Date) {
          return Math.ceil((date.getTime() - todayMs) / 86400000)
        }
        function fmt(date: Date) {
          return date.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })
        }
        function chip(diff: number) {
          if (diff <= 0)  return { color: '#ef4444', label: 'Due today' }
          if (diff <= 5)  return { color: '#f97316', label: `${diff}d left` }
          return           { color: '#22c55e',  label: `${diff}d left` }
        }

        const schedules = [
          { name: 'SSS',        sub: 'Contribution',    date: new Date(y, m + 1,  0) },
          { name: 'PhilHealth', sub: 'Contribution',    date: new Date(y, m + 1, 10) },
          { name: 'Pag-IBIG',   sub: 'Contribution',    date: new Date(y, m + 2,  0) },
          { name: 'BIR 1601-C', sub: 'Withholding Tax', date: new Date(y, m + 1, 15) },
        ]

        return (
          <div>
            <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">
              Remittance Schedules
            </h2>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {schedules.map(s => {
                const diff = daysLeft(s.date)
                const { color, label } = chip(diff)
                return (
                  <div key={s.name} className="bg-white rounded-xl px-4 py-3 flex items-center gap-3"
                    style={{ border: '1px solid #e2e8f0', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: color }} />
                    <div className="min-w-0">
                      <p className="text-sm font-bold" style={{ color: '#162d54' }}>{s.name}</p>
                      <p className="text-[11px] text-gray-400">{s.sub}</p>
                      <p className="text-[11px] font-semibold mt-0.5" style={{ color }}>
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
        <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">
          Today&apos;s Highlights
        </h2>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

          {/* Upcoming Birthdays */}
          <Card className="border-0 shadow-sm hover:shadow-md transition-shadow">
            <CardHeader className="pb-2 pt-4 px-5">
              <CardTitle className="text-sm font-semibold flex items-center gap-2 text-gray-700">
                <div className="bg-pink-100 p-1.5 rounded-lg">
                  <Cake className="w-3.5 h-3.5 text-pink-600" />
                </div>
                Upcoming Birthdays
                <Badge className="ml-auto bg-pink-100 text-pink-700 border-0 text-xs font-bold">
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
                      <div key={emp.id} className="flex items-center gap-3 p-2 rounded-xl hover:bg-pink-50 transition-colors">
                        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-pink-400 to-rose-500 flex items-center justify-center text-xs font-bold text-white shrink-0 shadow-sm">
                          {emp.firstName[0]}{emp.lastName[0]}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-gray-900 truncate">
                            {emp.firstName} {emp.lastName}
                          </p>
                          <p className="text-xs text-gray-400 truncate">{emp.position?.title || '—'}</p>
                        </div>
                        {isToday ? (
                          <Badge className="bg-pink-500 text-white border-0 text-xs shrink-0">Today!</Badge>
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
          <Card className="border-0 shadow-sm hover:shadow-md transition-shadow">
            <CardHeader className="pb-2 pt-4 px-5">
              <CardTitle className="text-sm font-semibold flex items-center gap-2 text-gray-700">
                <div className="bg-blue-50 p-1.5 rounded-lg">
                  <CalendarDays className="w-3.5 h-3.5 text-blue-600" />
                </div>
                Upcoming Holidays
                <Badge className="ml-auto bg-blue-50 text-blue-700 border-0 text-xs font-bold">
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
                        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#032b63] to-[#021e47] flex flex-col items-center justify-center shrink-0 shadow-sm">
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
                                : 'bg-blue-100 text-blue-600'
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
          <Card className="border-0 shadow-sm hover:shadow-md transition-shadow">
            <CardHeader className="pb-2 pt-4 px-5">
              <CardTitle className="text-sm font-semibold flex items-center gap-2 text-gray-700">
                <div className="bg-orange-50 p-1.5 rounded-lg">
                  <PlaneTakeoff className="w-3.5 h-3.5 text-orange-500" />
                </div>
                On Leave Today
                <Badge className="ml-auto bg-orange-100 text-orange-700 border-0 text-xs font-bold">
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
                    <div key={leave.id} className="flex items-center gap-3 p-2 rounded-xl hover:bg-orange-50 transition-colors">
                      <div className="w-9 h-9 rounded-full bg-gradient-to-br from-orange-400 to-amber-500 flex items-center justify-center text-xs font-bold text-white shrink-0 shadow-sm">
                        {leave.employee.firstName[0]}{leave.employee.lastName[0]}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-900 truncate">
                          {leave.employee.firstName} {leave.employee.lastName}
                        </p>
                        <p className="text-xs text-gray-400 truncate">{leave.employee.position?.title || '—'}</p>
                      </div>
                      <Badge className="bg-orange-100 text-orange-700 border-0 text-xs shrink-0">
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
