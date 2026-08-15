import { notFound } from 'next/navigation'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import { resolveEffectiveCompanyId } from '@/lib/effective-company'
import { formatCurrency } from '@/lib/utils'
import { format } from 'date-fns'
import { EmployeeProfileReferenceLayout } from '@/components/employees/EmployeeProfileReferenceLayout'

export default async function EmployeeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await auth()
  if (!session?.user) redirect('/login')

  const companyId = await resolveEffectiveCompanyId(session.user)
  if (!companyId) redirect('/login')

  const [employee, company, departments, positions] = await Promise.all([
   prisma.employee.findFirst({
    where: { id, companyId },
    include: {
      department: { select: { name: true } },
      position: { select: { title: true } },
      workSchedule: { select: { name: true, scheduleType: true, workDays: true } },
      leaveBalances: {
        include: { leaveType: { select: { name: true, code: true } } },
        orderBy: { leaveType: { name: 'asc' } },
      },
      payslips: {
        include: { payrollRun: { select: { periodStart: true, periodEnd: true } } },
        orderBy: { createdAt: 'desc' },
        take: 12,
      },
      performanceReviewsAsReviewee: {
        where: { overallRating: { not: null } },
        select: { overallRating: true },
        orderBy: { periodEnd: 'asc' },
        take: 12,
      },
    },
   }),
   prisma.company.findUnique({ where: { id: companyId }, select: { payrollCurrency: true } }),
   prisma.department.findMany({ where: { companyId, isActive: true }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
   prisma.position.findMany({ where: { companyId, isActive: true }, select: { id: true, title: true }, orderBy: { title: 'asc' } }),
  ])

  if (!employee) notFound()
  const currency = company?.payrollCurrency ?? 'PHP'
  const fmt = (n: number | string | null | undefined) => formatCurrency(n, currency)

  const initials = `${employee.firstName[0]}${employee.lastName[0]}`
  const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const workDays = Array.isArray(employee.workSchedule?.workDays)
    ? employee.workSchedule.workDays
        .map(v => Number(v))
        .filter(v => Number.isInteger(v) && v >= 0 && v <= 6)
    : [1, 2, 3, 4, 5]
  const isFlexible = !employee.workScheduleId
  const dayOffs = isFlexible
    ? 'Flexible'
    : dayLabels
        .map((d, idx) => ({ d, idx }))
        .filter(x => !workDays.includes(x.idx))
        .map(x => x.d)
        .join(', ') || 'â€”'
  const statusColors: Record<string, string> = {
    PROBATIONARY: 'bg-[#C0C8CA] text-[#000000]',
    REGULAR:      'bg-green-100 text-green-800',
    CONTRACTUAL:  'bg-yellow-100 text-yellow-800',
    PROJECT_BASED:'bg-orange-100 text-orange-800',
    PART_TIME:    'bg-[#C0C8CA] text-[#000000]',
    RESIGNED:     'bg-gray-100 text-gray-600',
    TERMINATED:   'bg-red-100 text-red-800',
    RETIRED:      'bg-purple-100 text-purple-700',
  }

  const recentHours = await prisma.dTRRecord.findMany({
    where: { employeeId: employee.id },
    select: { date: true, regularHours: true },
    orderBy: { date: 'desc' },
    take: 7,
  })

  return (
    <EmployeeProfileReferenceLayout
      employee={{
        id: employee.id, employeeNo: employee.employeeNo ?? '', firstName: employee.firstName,
        middleName: employee.middleName ?? '', lastName: employee.lastName, initials,
        photoUrl: employee.photoUrl, position: employee.position?.title ?? 'Unassigned',
        department: employee.department?.name ?? 'Unassigned', departmentId: employee.departmentId ?? '',
        positionId: employee.positionId ?? '', employmentStatus: employee.employmentStatus,
        employmentType: employee.employmentType, isActive: employee.isActive,
        hireDate: employee.hireDate?.toISOString() ?? new Date().toISOString(), gender: employee.gender ?? '',
        civilStatus: employee.civilStatus ?? '', birthDate: employee.birthDate?.toISOString() ?? '',
        personalEmail: employee.personalEmail ?? '', workEmail: employee.workEmail ?? '',
        mobileNo: employee.mobileNo ?? '', presentAddress: employee.presentAddress ?? '',
        notes: employee.notes ?? '', userId: employee.userId,
        rateType: employee.rateType, basicSalary: Number(employee.basicSalary), payFrequency: employee.payFrequency,
        bankName: employee.bankName ?? '', bankAccountNo: employee.bankAccountNo ?? '',
        sssEnabled: employee.sssEnabled, philhealthEnabled: employee.philhealthEnabled,
        pagibigEnabled: employee.pagibigEnabled, withholdingTaxEnabled: employee.withholdingTaxEnabled,
        isExemptFromTax: employee.isExemptFromTax, isMinimumWageEarner: employee.isMinimumWageEarner,
      }}
      leaves={employee.leaveBalances.map(item => ({
        id: item.id, name: item.leaveType.name, code: item.leaveType.code,
        entitled: Number(item.entitled), used: Number(item.used), pending: Number(item.pending), carriedOver: Number(item.carriedOver),
      }))}
      payslips={employee.payslips.map(item => ({
        id: item.id, grossPay: Number(item.grossPay), totalDeductions: Number(item.totalDeductions), netPay: Number(item.netPay),
        sssEmployee: Number(item.sssEmployee), philhealthEmployee: Number(item.philhealthEmployee), pagibigEmployee: Number(item.pagibigEmployee),
        withholdingTax: Number(item.withholdingTax), sssLoanDeduction: Number(item.sssLoanDeduction), pagibigLoan: Number(item.pagibigLoan),
        companyLoan: Number(item.companyLoan), lateDeduction: Number(item.lateDeduction), undertimeDeduction: Number(item.undertimeDeduction),
        absenceDeduction: Number(item.absenceDeduction), otherDeductions: Number(item.otherDeductions),
        periodStart: item.payrollRun?.periodStart?.toISOString() ?? '', periodEnd: item.payrollRun?.periodEnd?.toISOString() ?? '',
      }))}
      hours={recentHours.reverse().map(item => ({ date: item.date.toISOString(), hours: Number(item.regularHours ?? 0) }))}
      currency={currency}
      departments={departments}
      positions={positions}
      performanceRatings={employee.performanceReviewsAsReviewee.map(item => Number(item.overallRating))}
    />
  )
}
