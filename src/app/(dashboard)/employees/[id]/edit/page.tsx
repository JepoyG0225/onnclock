import Link from 'next/link'
import { ArrowLeft, ArrowUpRight, UserRound } from 'lucide-react'
import { notFound, redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { EmployeeForm } from '@/components/employees/EmployeeForm'
import { format } from 'date-fns'
import { resolveEffectiveCompanyId } from '@/lib/effective-company'

export default async function EditEmployeePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await auth()
  if (!session?.user) redirect('/login')

  const companyId = await resolveEffectiveCompanyId(session.user)
  if (!companyId) redirect('/login')

  const [employee, departments, positions, workSchedules] = await Promise.all([
    prisma.employee.findFirst({
      where: { id, companyId },
      include: {
        workSchedule: { select: { workDays: true } },
      },
    }),
    prisma.department.findMany({
      where: { companyId, isActive: true },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
    prisma.position.findMany({
      where: { companyId, isActive: true },
      select: { id: true, title: true },
      orderBy: { title: 'asc' },
    }),
    prisma.workSchedule.findMany({
      where: { companyId, isActive: true },
      select: { id: true, name: true, scheduleType: true },
      orderBy: { name: 'asc' },
    }),
  ])

  if (!employee) return notFound()

  const configuredWorkDays = Array.isArray(employee.workSchedule?.workDays)
    ? employee.workSchedule.workDays
        .map(v => Number(v))
        .filter(v => Number.isInteger(v) && v >= 0 && v <= 6)
    : [1, 2, 3, 4, 5]
  const dayOffDays = [0, 1, 2, 3, 4, 5, 6].filter(d => !configuredWorkDays.includes(d))

  const defaultValues = {
    employeeNo: employee.employeeNo,
    lastName: employee.lastName,
    firstName: employee.firstName,
    middleName: employee.middleName ?? '',
    suffix: employee.suffix ?? '',
    gender: employee.gender as 'MALE' | 'FEMALE' | 'OTHER',
    birthDate: employee.birthDate ? format(employee.birthDate, 'yyyy-MM-dd') : '',
    birthPlace: employee.birthPlace ?? '',
    civilStatus: (employee.civilStatus ?? 'SINGLE') as 'SINGLE' | 'MARRIED' | 'WIDOWED' | 'LEGALLY_SEPARATED',
    nationality: employee.nationality ?? 'Filipino',
    religion: employee.religion ?? '',
    personalEmail: employee.personalEmail ?? '',
    workEmail: employee.workEmail ?? '',
    mobileNo: employee.mobileNo ?? '',
    phoneNo: employee.phoneNo ?? '',
    presentAddress: employee.presentAddress ?? '',
    permanentAddress: employee.permanentAddress ?? '',
    sssNo: employee.sssNo ?? '',
    tinNo: employee.tinNo ?? '',
    philhealthNo: employee.philhealthNo ?? '',
    pagibigNo: employee.pagibigNo ?? '',
    emergencyContactName: employee.emergencyContactName ?? '',
    emergencyContactRelation: employee.emergencyContactRelation ?? '',
    emergencyContactPhone: employee.emergencyContactPhone ?? '',
    departmentId: employee.departmentId ?? '',
    positionId: employee.positionId ?? '',
    directManagerId: employee.directManagerId ?? '',
    employmentStatus: employee.employmentStatus as 'PROBATIONARY' | 'REGULAR' | 'CONTRACTUAL' | 'PROJECT_BASED' | 'PART_TIME' | 'RESIGNED' | 'TERMINATED' | 'RETIRED',
    employmentType: employee.employmentType as 'FULL_TIME' | 'PART_TIME' | 'CONTRACTUAL',
    hireDate: employee.hireDate ? format(employee.hireDate, 'yyyy-MM-dd') : '',
    regularizationDate: employee.regularizationDate ? format(employee.regularizationDate, 'yyyy-MM-dd') : '',
    rateType: employee.rateType as 'MONTHLY' | 'DAILY' | 'HOURLY',
    basicSalary: Number(employee.basicSalary),
    payFrequency: employee.payFrequency as 'SEMI_MONTHLY' | 'MONTHLY' | 'WEEKLY' | 'DAILY',
    workScheduleId: employee.workScheduleId ?? '',
    dayOffDays,
    bankName: employee.bankName ?? '',
    bankAccountNo: employee.bankAccountNo ?? '',
    isExemptFromTax: employee.isExemptFromTax,
    isMinimumWageEarner: employee.isMinimumWageEarner,
    disableHolidayPay: (employee as { disableHolidayPay?: boolean }).disableHolidayPay ?? false,
    disableLateDeduction: (employee as { disableLateDeduction?: boolean }).disableLateDeduction ?? false,
    disableUndertimeDeduction: (employee as { disableUndertimeDeduction?: boolean }).disableUndertimeDeduction ?? false,
    disableNightDifferential: employee.disableNightDifferential ?? false,
    disableEarlyInOt: employee.disableEarlyInOt,
    disableBeyondScheduleOt: employee.disableBeyondScheduleOt,
    trackTime: employee.trackTime,
    fingerprintExempt: employee.fingerprintExempt ?? false,
    geofenceExempt: employee.geofenceExempt ?? false,
    selfieExempt: employee.selfieExempt ?? false,
    sssEnabled: employee.sssEnabled ?? true,
    philhealthEnabled: employee.philhealthEnabled ?? true,
    pagibigEnabled: employee.pagibigEnabled ?? true,
    withholdingTaxEnabled: employee.withholdingTaxEnabled ?? true,
    notes: employee.notes ?? '',
  }

  return (
    <div className="space-y-6">
      <Link href={`/employees/${id}`} className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-[#162d54]"><ArrowLeft size={15}/>Back to employee</Link>
      <header className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 shadow-sm">
        <div className="absolute inset-y-0 left-0 w-1 bg-[#ff5900]"/>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-4">
            <div className="hidden h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#fff3ec] text-[#c44d00] sm:flex"><UserRound size={26}/></div>
            <div className="min-w-0"><p className="mb-1 text-[11px] font-semibold uppercase tracking-widest text-slate-500">People / Employee profile</p>
              <h1 className="text-2xl font-semibold tracking-tight text-[#162d54]">Edit employee</h1>
              <p className="mt-1 break-words text-sm text-slate-600">{employee.firstName} {employee.lastName}<span className="mx-2 text-slate-300">/</span>{employee.employeeNo}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span className={`rounded-full px-3 py-1.5 text-xs font-medium text-white ${employee.isActive ? 'bg-[#162d54]' : 'bg-slate-500'}`}>{employee.employmentStatus.replaceAll('_', ' ')}</span>
            <Link href={`/employees/${id}`} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-[#162d54] hover:bg-slate-50">View profile<ArrowUpRight size={15}/></Link>
          </div>
        </div>
      </header>

      {/* Form */}
      <EmployeeForm
        departments={departments}
        positions={positions}
        workSchedules={workSchedules}
        defaultValues={defaultValues}
        employeeId={id}
        hasPortalUser={Boolean(employee.userId)}
      />
    </div>
  )
}
