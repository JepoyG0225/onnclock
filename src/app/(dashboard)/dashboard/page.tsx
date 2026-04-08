import { cache } from 'react'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'

const getSession = cache(auth)
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Users, CalendarDays, TrendingUp, AlertCircle, UserCheck, Cake, PlaneTakeoff } from 'lucide-react'
import { peso } from '@/lib/utils'
import { PesoIcon } from '@/components/ui/PesoIcon'

export default async function DashboardPage() {
  const session = await getSession()
  if (!session?.user) redirect('/login')

  const companyId = session.user.companyId
  if (!companyId) redirect('/login')
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0)
  const todayEnd   = new Date(); todayEnd.setHours(23, 59, 59, 999)

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { name: true },
  })

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

  const [
    totalEmployees,
    activeEmployees,
    pendingLeaves,
    lastPayrollRun,
    clockedInToday,
    upcomingHolidays,
    allEmployeesWithBirthday,
    onLeaveToday,
  ] = await Promise.all([
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
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  })

  return (
    <div className="space-y-6">

      {/* ── Welcome Banner ── */}
      <div className="rounded-2xl bg-gradient-to-br from-teal-600 via-teal-700 to-teal-900 p-6 text-white relative overflow-hidden">
        {/* decorative circles */}
        <div className="absolute -right-10 -top-10 w-40 h-40 rounded-full bg-white/5" />
        <div className="absolute right-8 top-12 w-24 h-24 rounded-full bg-white/5" />
        <div className="absolute -left-6 -bottom-6 w-28 h-28 rounded-full bg-white/5" />

        <div className="relative">
          <p className="text-teal-200 text-sm">{todayLabel}</p>
          <h1 className="text-2xl font-bold mt-0.5">Dashboard</h1>
          <p className="text-teal-100 text-sm mt-0.5">{company.name}</p>

        </div>
      </div>

      {/* ── Stats Grid ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">

        {/* Total Employees */}
        <Card className="border-0 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm font-medium text-gray-500">Total Employees</p>
              <div className="bg-teal-50 p-2 rounded-lg">
                <Users className="w-4 h-4 text-teal-600" />
              </div>
            </div>
            <p className="text-3xl font-bold text-gray-900">{totalEmployees}</p>
            <p className="text-xs text-gray-400 mt-1.5">
              <span className="text-teal-600 font-semibold">{activeEmployees}</span> active
            </p>
            <div className="absolute bottom-0 right-0 w-20 h-20 bg-teal-50 rounded-tl-full opacity-60" />
          </CardContent>
        </Card>

        {/* Last Payroll */}
        <Card className="border-0 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm font-medium text-gray-500">Last Payroll</p>
              <div className="bg-green-50 p-2 rounded-lg">
                <PesoIcon className="w-4 h-4 text-green-600" />
              </div>
            </div>
            <p className="text-3xl font-bold text-gray-900">
              {lastPayrollRun ? peso(Number(lastPayrollRun.totalNetPay)) : '—'}
            </p>
            <p className="text-xs text-gray-400 mt-1.5">
              {lastPayrollRun ? lastPayrollRun.periodLabel : 'No payroll run yet'}
            </p>
            <div className="absolute bottom-0 right-0 w-20 h-20 bg-green-50 rounded-tl-full opacity-60" />
          </CardContent>
        </Card>

        {/* Pending Leaves */}
        <Card className={`border-0 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden ${pendingLeaves > 0 ? 'ring-1 ring-yellow-200' : ''}`}>
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm font-medium text-gray-500">Pending Leaves</p>
              <div className={`p-2 rounded-lg ${pendingLeaves > 0 ? 'bg-yellow-50' : 'bg-gray-50'}`}>
                <CalendarDays className={`w-4 h-4 ${pendingLeaves > 0 ? 'text-yellow-500' : 'text-gray-400'}`} />
              </div>
            </div>
            <p className={`text-3xl font-bold ${pendingLeaves > 0 ? 'text-yellow-600' : 'text-gray-900'}`}>
              {pendingLeaves}
            </p>
            <p className="text-xs text-gray-400 mt-1.5">
              {pendingLeaves > 0 ? 'Awaiting your approval' : 'All leaves reviewed'}
            </p>
            <div className={`absolute bottom-0 right-0 w-20 h-20 rounded-tl-full opacity-60 ${pendingLeaves > 0 ? 'bg-yellow-50' : 'bg-gray-50'}`} />
          </CardContent>
        </Card>

        {/* Clocked In Today */}
        <Card className="border-0 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm font-medium text-gray-500">Clocked In Today</p>
              <div className="bg-purple-50 p-2 rounded-lg">
                <UserCheck className="w-4 h-4 text-purple-600" />
              </div>
            </div>
            <p className="text-3xl font-bold text-gray-900">{clockedInToday}</p>
            <div className="mt-2.5">
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs text-gray-400">of {activeEmployees} active</p>
                <p className="text-xs font-semibold text-purple-600">{clockInPct}%</p>
              </div>
              <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-purple-400 rounded-full"
                  style={{ width: `${clockInPct}%` }}
                />
              </div>
            </div>
            <div className="absolute bottom-0 right-0 w-20 h-20 bg-purple-50 rounded-tl-full opacity-60" />
          </CardContent>
        </Card>
      </div>

      {/* ── Today's Highlights ── */}
      <div>
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">
          Today&apos;s Highlights
        </h2>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

          {/* Upcoming Birthdays */}
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-2 pt-4 px-5">
              <CardTitle className="text-sm font-semibold flex items-center gap-2 text-gray-700">
                <div className="bg-pink-50 p-1.5 rounded-lg">
                  <Cake className="w-3.5 h-3.5 text-pink-500" />
                </div>
                Upcoming Birthdays
                <Badge className="ml-auto bg-pink-50 text-pink-600 border-0 text-xs font-semibold">
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
                        <div className="w-9 h-9 rounded-full bg-pink-100 flex items-center justify-center text-xs font-bold text-pink-700 shrink-0">
                          {emp.firstName[0]}{emp.lastName[0]}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">
                            {emp.firstName} {emp.lastName}
                          </p>
                          <p className="text-xs text-gray-400 truncate">{emp.position?.title || '—'}</p>
                        </div>
                        {isToday ? (
                          <Badge className="bg-pink-500 text-white border-0 text-xs shrink-0">Today!</Badge>
                        ) : (
                          <span className="text-xs text-gray-400 shrink-0 whitespace-nowrap">
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
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-2 pt-4 px-5">
              <CardTitle className="text-sm font-semibold flex items-center gap-2 text-gray-700">
                <div className="bg-teal-50 p-1.5 rounded-lg">
                  <CalendarDays className="w-3.5 h-3.5 text-teal-500" />
                </div>
                Upcoming Holidays
                <Badge className="ml-auto bg-teal-50 text-teal-600 border-0 text-xs font-semibold">
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
                      <div key={holiday.id} className="flex items-center gap-3 p-2 rounded-xl hover:bg-teal-50 transition-colors">
                        <div className="w-9 h-9 rounded-xl bg-teal-50 flex flex-col items-center justify-center shrink-0">
                          <span className="text-[9px] font-bold text-teal-500 uppercase leading-none">
                            {hDate.toLocaleDateString('en-PH', { month: 'short' })}
                          </span>
                          <span className="text-sm font-bold text-teal-700 leading-tight">{hDate.getDate()}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">{holiday.name}</p>
                          <Badge
                            className={`mt-0.5 text-[10px] border-0 px-1.5 py-0 h-4 ${
                              holiday.type === 'REGULAR'
                                ? 'bg-red-100 text-red-600'
                                : 'bg-teal-100 text-teal-600'
                            }`}
                          >
                            {holiday.type === 'REGULAR' ? 'Regular' : 'Special'}
                          </Badge>
                        </div>
                        <span className="text-xs text-gray-400 shrink-0 whitespace-nowrap">
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
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-2 pt-4 px-5">
              <CardTitle className="text-sm font-semibold flex items-center gap-2 text-gray-700">
                <div className="bg-orange-50 p-1.5 rounded-lg">
                  <PlaneTakeoff className="w-3.5 h-3.5 text-orange-500" />
                </div>
                On Leave Today
                <Badge className="ml-auto bg-orange-50 text-orange-600 border-0 text-xs font-semibold">
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
                      <div className="w-9 h-9 rounded-full bg-orange-100 flex items-center justify-center text-xs font-bold text-orange-700 shrink-0">
                        {leave.employee.firstName[0]}{leave.employee.lastName[0]}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">
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

      {/* ── Government Remittance ── */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3 pt-4 px-5">
          <CardTitle className="text-sm font-semibold flex items-center gap-2 text-gray-700">
            <div className="bg-gray-100 p-1.5 rounded-lg">
              <TrendingUp className="w-3.5 h-3.5 text-gray-600" />
            </div>
            Government Remittance Schedule
          </CardTitle>
        </CardHeader>
        <CardContent className="px-5 pb-5">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="flex gap-3 p-4 rounded-xl bg-teal-50 border border-teal-100">
              <div className="w-1 rounded-full bg-teal-400 shrink-0" />
              <div>
                <p className="text-sm font-bold text-teal-800">SSS</p>
                <p className="text-xs text-teal-600 mt-0.5 font-medium">Due: Last day of following month</p>
                <p className="text-xs text-gray-500 mt-2">R3 Form — Monthly contribution collection list</p>
              </div>
            </div>
            <div className="flex gap-3 p-4 rounded-xl bg-green-50 border border-green-100">
              <div className="w-1 rounded-full bg-green-400 shrink-0" />
              <div>
                <p className="text-sm font-bold text-green-800">PhilHealth</p>
                <p className="text-xs text-green-600 mt-0.5 font-medium">Due: Last day of following month</p>
                <p className="text-xs text-gray-500 mt-2">RF-1 Form — Premium Remittance Return</p>
              </div>
            </div>
            <div className="flex gap-3 p-4 rounded-xl bg-yellow-50 border border-yellow-100">
              <div className="w-1 rounded-full bg-yellow-400 shrink-0" />
              <div>
                <p className="text-sm font-bold text-yellow-800">Pag-IBIG / BIR</p>
                <p className="text-xs text-yellow-600 mt-0.5 font-medium">Due: 10th of following month</p>
                <p className="text-xs text-gray-500 mt-2">MCRF / 1601C — Monthly contributions & withholding tax</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
