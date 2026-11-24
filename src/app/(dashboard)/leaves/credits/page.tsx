import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import { availableLeave } from '@/lib/leaves/balance'
import { LeaveCreditsTable, type CreditRow } from '@/components/leaves/LeaveCreditsTable'

export default async function LeaveCreditsPage({ searchParams }: { searchParams: Promise<{ year?: string }> }) {
  const session = await auth()
  if (!session?.user?.companyId) redirect('/login')
  if (!['SUPER_ADMIN', 'COMPANY_ADMIN', 'HR_MANAGER', 'PAYROLL_OFFICER'].includes(session.user.role)) redirect('/dashboard')
  const params = await searchParams
  const currentYear = Number(new Intl.DateTimeFormat('en', { timeZone: 'Asia/Manila', year: 'numeric' }).format(new Date()))
  const requestedYear = Number(params.year ?? currentYear)
  const year = Number.isInteger(requestedYear) && requestedYear >= 2000 && requestedYear <= 2200 ? requestedYear : currentYear
  const companyId = session.user.companyId
  const employees = await prisma.employee.findMany({
    where: { companyId },
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    select: {
      id: true, employeeNo: true, firstName: true, lastName: true, isActive: true,
      department: { select: { name: true } },
      leaveBalances: {
        where: { year, leaveType: { companyId } },
        orderBy: { leaveType: { name: 'asc' } },
        select: { id: true, entitled: true, carriedOver: true, used: true, pending: true, encashed: true,
          leaveType: { select: { id: true, name: true, isPaidOut: true, isActive: true } } },
      },
    },
  })
  const rows = employees.flatMap<CreditRow>(e => {
    const employee = { employeeId: e.id, employeeNo: e.employeeNo, employee: `${e.firstName} ${e.lastName}`, active: e.isActive, department: e.department?.name ?? 'Unassigned' }
    if (!e.leaveBalances.length) return [{ ...employee, id: e.id, balanceId: null, typeId: '', type: 'No leave credits allocated', convertible: false, typeActive: false, entitled: 0, carriedOver: 0, used: 0, pending: 0, encashed: 0, remaining: 0 }]
    return e.leaveBalances.map(b => ({ ...employee, id: b.id, balanceId: b.id, typeId: b.leaveType.id, type: b.leaveType.name,
      convertible: b.leaveType.isPaidOut, typeActive: b.leaveType.isActive, entitled: Number(b.entitled), carriedOver: Number(b.carriedOver),
      used: Number(b.used), pending: Number(b.pending), encashed: Number(b.encashed), remaining: availableLeave(b) }))
  })
  return <LeaveCreditsTable rows={rows} year={year} />
}
