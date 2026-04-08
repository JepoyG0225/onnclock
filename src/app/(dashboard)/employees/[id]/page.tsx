import { notFound } from 'next/navigation'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import {User, Briefcase, FileText, CreditCard, Settings} from 'lucide-react'
import { peso } from '@/lib/utils'
import { format } from 'date-fns'
import { PesoIcon } from '@/components/ui/PesoIcon'
import { EmployeePortalAccess } from '@/components/employees/EmployeePortalAccess'
import { EmployeeDeleteButton } from '@/components/employees/EmployeeDeleteButton'

export default async function EmployeeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await auth()
  if (!session?.user) return null

  const companyId = session.user.companyId!

  const employee = await prisma.employee.findFirst({
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
      loans: {
        where: { status: 'ACTIVE' },
        select: {
          id: true, loanType: true, principalAmount: true, balance: true, monthlyAmortization: true, startDate: true,
        },
      },
    },
  })

  if (!employee) return notFound()

  const initials = `${employee.firstName[0]}${employee.lastName[0]}`
  const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const workDays = Array.isArray(employee.workSchedule?.workDays)
    ? employee.workSchedule.workDays
        .map(v => Number(v))
        .filter(v => Number.isInteger(v) && v >= 0 && v <= 6)
    : [1, 2, 3, 4, 5]
  const dayOffs = dayLabels
    .map((d, idx) => ({ d, idx }))
    .filter(x => !workDays.includes(x.idx))
    .map(x => x.d)
    .join(', ') || '—'
  const statusColors: Record<string, string> = {
    PROBATIONARY: 'bg-teal-100 text-teal-700',
    REGULAR:      'bg-green-100 text-green-800',
    CONTRACTUAL:  'bg-yellow-100 text-yellow-800',
    PROJECT_BASED:'bg-orange-100 text-orange-800',
    PART_TIME:    'bg-cyan-100 text-cyan-700',
    RESIGNED:     'bg-gray-100 text-gray-600',
    TERMINATED:   'bg-red-100 text-red-800',
    RETIRED:      'bg-purple-100 text-purple-700',
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-4">
          {employee.photoUrl ? (
            <img
              src={employee.photoUrl}
              alt={`${employee.firstName} ${employee.lastName}`}
              className="w-12 h-12 rounded-full object-cover border border-gray-200"
            />
          ) : (
            <div className="w-12 h-12 rounded-full bg-teal-600 flex items-center justify-center text-white font-bold text-lg">
              {initials}
            </div>
          )}
          <div>
            <h1 className="text-xl font-bold text-gray-900">
              {employee.lastName}, {employee.firstName} {employee.middleName ?? ''}
            </h1>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              <span className="text-sm text-gray-500">{employee.employeeNo}</span>
              {employee.position && <span className="text-sm text-gray-500">· {employee.position.title}</span>}
              {employee.department && <span className="text-sm text-gray-500">· {employee.department.name}</span>}
              <span className={`px-2 py-0.5 rounded text-xs font-semibold ${statusColors[employee.employmentStatus] ?? 'bg-gray-100 text-gray-600'}`}>
                {employee.employmentStatus}
              </span>
            </div>
          </div>
        </div>
        <div className="ml-auto">
          <div className="flex gap-2">
            <Link href={`/employees/${id}/edit`}>
              <Button size="sm" variant="outline">Edit Employee</Button>
            </Link>
            <EmployeeDeleteButton employeeId={id} />
          </div>
        </div>
      </div>

      <Tabs defaultValue="personal">
        <TabsList>
          <TabsTrigger value="personal" className="flex items-center gap-2">
            <User className="w-3.5 h-3.5" />Personal
          </TabsTrigger>
          <TabsTrigger value="employment" className="flex items-center gap-2">
            <Briefcase className="w-3.5 h-3.5" />Employment
          </TabsTrigger>
          <TabsTrigger value="compensation" className="flex items-center gap-2">
            <PesoIcon className="w-3.5 h-3.5" />Compensation
          </TabsTrigger>
          <TabsTrigger value="leaves" className="flex items-center gap-2">
            <FileText className="w-3.5 h-3.5" />Leaves
          </TabsTrigger>
          <TabsTrigger value="payslips" className="flex items-center gap-2">
            <FileText className="w-3.5 h-3.5" />Payslips
          </TabsTrigger>
          <TabsTrigger value="loans" className="flex items-center gap-2">
            <CreditCard className="w-3.5 h-3.5" />Loans
          </TabsTrigger>
          <TabsTrigger value="settings" className="flex items-center gap-2">
            <Settings className="w-3.5 h-3.5" />Settings
          </TabsTrigger>
        </TabsList>

        {/* Personal Info */}
        <TabsContent value="personal" className="mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader><CardTitle className="text-sm">Personal Information</CardTitle></CardHeader>
              <CardContent className="space-y-3 text-sm">
                {[
                  ['Full Name', `${employee.firstName} ${employee.middleName ? employee.middleName + ' ' : ''}${employee.lastName}`],
                  ['Gender', employee.gender ?? '—'],
                  ['Civil Status', employee.civilStatus ?? '—'],
                  ['Date of Birth', employee.birthDate ? format(new Date(employee.birthDate), 'MMMM d, yyyy') : '—'],
                  ['Nationality', employee.nationality ?? 'Filipino'],
                  ['Personal Email', employee.personalEmail ?? '—'],
                  ['Mobile', employee.mobileNo ?? '—'],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between border-b pb-2 last:border-0">
                    <span className="text-gray-500">{k}</span>
                    <span className="font-medium">{v}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-sm">Government IDs</CardTitle></CardHeader>
              <CardContent className="space-y-3 text-sm">
                {[
                  ['SSS Number', employee.sssNo],
                  ['TIN', employee.tinNo],
                  ['PhilHealth No.', employee.philhealthNo],
                  ['Pag-IBIG MID', employee.pagibigNo],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between border-b pb-2 last:border-0">
                    <span className="text-gray-500">{k}</span>
                    <span className="font-mono font-medium">{v ?? '—'}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Employment */}
        <TabsContent value="employment" className="mt-4">
          <Card>
            <CardHeader><CardTitle className="text-sm">Employment Details</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm">
              {[
                ['Employee No.', employee.employeeNo ?? '—'],
                ['Department', employee.department?.name ?? '—'],
                ['Status', employee.employmentStatus],
                ['Position', employee.position?.title ?? '—'],
                ['Type', employee.employmentType ?? '—'],
                ['Work Schedule', employee.workSchedule?.name ?? '—'],
                ['Day Offs', dayOffs],
                ['Date Hired', employee.hireDate ? format(new Date(employee.hireDate), 'MMMM d, yyyy') : '—'],
                ['Regularization Date', employee.regularizationDate ? format(new Date(employee.regularizationDate), 'MMMM d, yyyy') : '—'],
                ['Date Resigned', employee.resignationDate ? format(new Date(employee.resignationDate), 'MMMM d, yyyy') : '—'],
                ['Pay Frequency', employee.payFrequency],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between border-b pb-2">
                  <span className="text-gray-500">{k}</span>
                  <span className="font-medium">{v}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Compensation */}
        <TabsContent value="compensation" className="mt-4">
          <Card>
            <CardHeader><CardTitle className="text-sm">Compensation</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm">
              {[
                ['Rate Type', employee.rateType],
                ['Basic Salary (Monthly)', peso(Number(employee.basicSalary))],
                ['Daily Rate', peso(Number(employee.dailyRate ?? 0) || Number(employee.basicSalary) / 22)],
                ['Hourly Rate', peso(Number(employee.hourlyRate ?? 0) || Number(employee.basicSalary) / 22 / 8)],
                ['Minimum Wage Earner', employee.isMinimumWageEarner ? 'Yes' : 'No'],
                ['Exempt from Tax', employee.isExemptFromTax ? 'Yes' : 'No'],
                ['Track Time (DTR-Based Pay)', employee.trackTime ? 'Yes' : 'No'],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between border-b pb-2">
                  <span className="text-gray-500">{k}</span>
                  <span className="font-medium">{v}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Leave Balances */}
        <TabsContent value="leaves" className="mt-4">
          <Card>
            <CardHeader><CardTitle className="text-sm">Leave Balances — {new Date().getFullYear()}</CardTitle></CardHeader>
            <CardContent className="p-0">
              {employee.leaveBalances.length === 0 ? (
                <p className="p-4 text-gray-400 text-sm">No leave balances</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="text-left p-3 font-medium text-gray-600">Leave Type</th>
                      <th className="text-right p-3 font-medium text-gray-600">Entitled</th>
                      <th className="text-right p-3 font-medium text-gray-600">Used</th>
                      <th className="text-right p-3 font-medium text-gray-600">Pending</th>
                      <th className="text-right p-3 font-medium text-gray-600">Available</th>
                    </tr>
                  </thead>
                  <tbody>
                    {employee.leaveBalances.map(b => {
                      const available = Number(b.entitled) + Number(b.carriedOver) - Number(b.used) - Number(b.pending)
                      return (
                        <tr key={b.id} className="border-b">
                          <td className="p-3">
                            <Badge variant="outline" className="text-xs mr-2">{b.leaveType.code}</Badge>
                            {b.leaveType.name}
                          </td>
                          <td className="p-3 text-right">{Number(b.entitled)}d</td>
                          <td className="p-3 text-right text-red-600">{Number(b.used)}d</td>
                          <td className="p-3 text-right text-yellow-600">{Number(b.pending)}d</td>
                          <td className="p-3 text-right font-bold text-teal-700">{available}d</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Settings / Portal Access */}
        <TabsContent value="settings" className="mt-4">
          <EmployeePortalAccess
            employeeId={employee.id}
            workEmail={employee.workEmail ?? null}
            personalEmail={employee.personalEmail ?? null}
            hasUser={Boolean(employee.userId)}
            editable={false}
          />
        </TabsContent>

        {/* Payslips */}
        <TabsContent value="payslips" className="mt-4">
          <Card>
            <CardHeader><CardTitle className="text-sm">Recent Payslips</CardTitle></CardHeader>
            <CardContent className="p-0">
              {employee.payslips.length === 0 ? (
                <p className="p-4 text-gray-400 text-sm">No payslips yet</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="text-left p-3 font-medium text-gray-600">Period</th>
                      <th className="text-right p-3 font-medium text-gray-600">Gross Pay</th>
                      <th className="text-right p-3 font-medium text-gray-600">Deductions</th>
                      <th className="text-right p-3 font-medium text-gray-600">Net Pay</th>
                    </tr>
                  </thead>
                  <tbody>
                    {employee.payslips.map(ps => (
                      <tr key={ps.id} className="border-b hover:bg-gray-50">
                        <td className="p-3 text-xs font-mono">
                          {ps.payrollRun?.periodStart
                            ? format(new Date(ps.payrollRun.periodStart), 'MMM d')
                            : '—'
                          } – {ps.payrollRun?.periodEnd
                            ? format(new Date(ps.payrollRun.periodEnd), 'MMM d, yyyy')
                            : '—'
                          }
                        </td>
                        <td className="p-3 text-right">{peso(Number(ps.grossPay))}</td>
                        <td className="p-3 text-right text-red-600">{peso(Number(ps.totalDeductions))}</td>
                        <td className="p-3 text-right font-bold text-green-700">{peso(Number(ps.netPay))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Active Loans */}
        <TabsContent value="loans" className="mt-4">
          <Card>
            <CardHeader><CardTitle className="text-sm">Active Loans</CardTitle></CardHeader>
            <CardContent className="p-0">
              {employee.loans.length === 0 ? (
                <p className="p-4 text-gray-400 text-sm">No active loans</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="text-left p-3 font-medium text-gray-600">Type</th>
                      <th className="text-right p-3 font-medium text-gray-600">Loan Amount</th>
                      <th className="text-right p-3 font-medium text-gray-600">Balance</th>
                      <th className="text-right p-3 font-medium text-gray-600">Monthly</th>
                      <th className="text-left p-3 font-medium text-gray-600">Start</th>
                    </tr>
                  </thead>
                  <tbody>
                    {employee.loans.map(l => (
                      <tr key={l.id} className="border-b">
                        <td className="p-3">
                          <Badge className="text-xs">{l.loanType}</Badge>
                        </td>
                        <td className="p-3 text-right">{peso(Number(l.principalAmount))}</td>
                        <td className="p-3 text-right text-red-600 font-medium">{peso(Number(l.balance))}</td>
                        <td className="p-3 text-right">{peso(Number(l.monthlyAmortization))}</td>
                        <td className="p-3 text-xs">{format(new Date(l.startDate), 'MMM yyyy')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
