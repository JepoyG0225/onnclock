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
      select: { id: true, name: true },
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
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold" style={{ color: '#2E4156' }}>Edit Employee</h1>
        <div className="flex items-center gap-2 flex-wrap text-sm text-slate-500 mt-1">
          <span>{employee.lastName}, {employee.firstName} {employee.middleName ?? ''}</span>
          <span>Â·</span>
          <span>{employee.employeeNo}</span>
          <span
            className="px-2 py-0.5 rounded text-xs font-semibold"
            style={{
              background: ['PROBATIONARY', 'REGULAR'].includes(employee.employmentStatus)
                ? 'rgba(16,185,129,0.1)' : 'rgba(100,116,139,0.1)',
              color: ['PROBATIONARY', 'REGULAR'].includes(employee.employmentStatus)
                ? '#059669' : '#64748b',
            }}
          >
            {employee.employmentStatus}
          </span>
        </div>
      </div>

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
