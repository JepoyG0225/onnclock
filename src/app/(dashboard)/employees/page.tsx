import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import { resolveEffectiveCompanyId } from '@/lib/effective-company'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { EmployeeDeleteButton } from '@/components/employees/EmployeeDeleteButton'
import { EmployeeViewButton } from '@/components/employees/EmployeeViewButton'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PageHeader } from '@/components/ui/page-header'
import { EmptyState } from '@/components/ui/empty-state'
import { Users, Search } from 'lucide-react'
import { formatDate, formatCurrency, getStatusColor } from '@/lib/utils'
import { EmploymentStatus } from '@prisma/client'
import { getSeatStatus } from '@/lib/billing/seat-limit'
import { EmployeeImportButton } from '@/components/employees/EmployeeImportButton'
import { AddEmployeeButton } from '@/components/employees/AddEmployeeButton'

export default async function EmployeesPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; department?: string; status?: string; page?: string }>
}) {
  const params = await searchParams
  const session = await auth()
  if (!session?.user) redirect('/login')

  const companyId = await resolveEffectiveCompanyId(session.user)
  if (!companyId) redirect('/login')
  const search = params.search || ''
  const departmentId = params.department || undefined
  const status = params.status || undefined
  const page = parseInt(params.page || '1')
  const limit = 20

  // "Delete" is a soft delete (isActive=false). Default the list to active
  // employees so a deleted employee actually disappears; the special
  // "INACTIVE" filter surfaces deactivated employees so HR can reactivate them.
  const showInactive = status === 'INACTIVE'
  const where = {
    companyId,
    isActive: !showInactive,
    ...(departmentId && { departmentId }),
    ...(status && status !== 'INACTIVE' && { employmentStatus: status as EmploymentStatus }),
    ...(search && {
      OR: [
        { firstName: { contains: search } },
        { lastName: { contains: search } },
        { employeeNo: { contains: search } },
      ],
    }),
  }

  const [employees, total, departments, company, seat] = await Promise.all([
    prisma.employee.findMany({
      where,
      include: {
        department: { select: { name: true } },
        position: { select: { title: true } },
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.employee.count({ where }),
    prisma.department.findMany({
      where: { companyId, isActive: true },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
    prisma.company.findUnique({ where: { id: companyId }, select: { payrollCurrency: true } }),
    getSeatStatus(companyId),
  ])
  const currency = company?.payrollCurrency ?? 'PHP'
  const fmt = (n: number | string | null | undefined) => formatCurrency(n, currency)

  // Preemptive UI block: when the company is at-or-over their paid seat
  // cap, replace the "Add Employee" link with a disabled button that
  // routes to billing instead. Saves the user from filling out the
  // whole form and getting bounced by the API's 402. SUPER_ADMIN
  // bypasses (same logic as the API).
  const isSuperAdmin = session.user.role === 'SUPER_ADMIN'
  const atSeatCap = !isSuperAdmin && seat.enforceCap && seat.activeCount >= seat.paidSeats

  return (
    <div className="space-y-6">
      <PageHeader
        title="Employees"
        subtitle={`${total} total ${total === 1 ? 'employee' : 'employees'}`}
        actions={
          <>
            <EmployeeImportButton />
            <AddEmployeeButton
              atSeatCap={atSeatCap}
              activeCount={seat.activeCount}
              paidSeats={seat.paidSeats}
            />
          </>
        }
      />

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <form className="flex flex-wrap gap-3" data-tour="employee-filters">
            <div className="flex-1 min-w-48 relative" data-tour="employee-search">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                name="search"
                placeholder="Search by name or employee no..."
                defaultValue={search}
                className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#032b63]"
              />
            </div>
            <select
              name="department"
              defaultValue={departmentId}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#032b63]"
            >
              <option value="">All Departments</option>
              {departments.map(d => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
            <select
              name="status"
              defaultValue={status}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#032b63]"
            >
              <option value="">All Status</option>
              <option value="PROBATIONARY">Probationary</option>
              <option value="REGULAR">Regular</option>
              <option value="CONTRACTUAL">Contractual</option>
              <option value="RESIGNED">Resigned</option>
              <option value="TERMINATED">Terminated</option>
              <option value="INACTIVE">Inactive (Deactivated)</option>
            </select>
            <Button type="submit" variant="outline" size="sm">Filter</Button>
          </form>
        </CardContent>
      </Card>

      {/* Employee Table */}
      <Card>
        <CardContent className="p-0">
          {employees.length === 0 ? (
            <EmptyState
              icon={<Users className="w-6 h-6" />}
              title="No employees found"
              description="Add your first employee to start tracking time and processing payroll."
              action={
                <Link href="/employees/new">
                  <Button size="sm" variant="accent">Add your first employee</Button>
                </Link>
              }
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50">
                    <th className="text-left p-4 font-semibold text-gray-600">Employee</th>
                    <th className="text-left p-4 font-semibold text-gray-600 hidden md:table-cell">Department</th>
                    <th className="text-left p-4 font-semibold text-gray-600 hidden lg:table-cell">Position</th>
                    <th className="text-left p-4 font-semibold text-gray-600">Status</th>
                    <th className="text-right p-4 font-semibold text-gray-600 hidden sm:table-cell">Rate</th>
                    <th className="text-left p-4 font-semibold text-gray-600 hidden lg:table-cell">Hire Date</th>
                    <th className="text-center p-4 font-semibold text-gray-600">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {employees.map((emp) => (
                    <tr key={emp.id} className="border-b hover:bg-gray-50 transition-colors">
                      <td className="p-4">
                        <div className="flex items-center gap-3">
                          {emp.photoUrl ? (
                            <img
                              src={emp.photoUrl}
                              alt={`${emp.firstName} ${emp.lastName}`}
                              className="w-9 h-9 rounded-full object-cover border border-gray-200 flex-shrink-0"
                            />
                          ) : (
                            <div className="w-9 h-9 rounded-full bg-[#c4d9ff] flex items-center justify-center text-xs font-bold text-primary flex-shrink-0">
                              {emp.firstName[0]}{emp.lastName[0]}
                            </div>
                          )}
                          <div>
                            <p className="font-medium text-gray-900">
                              {emp.lastName}, {emp.firstName} {emp.middleName?.[0] ? `${emp.middleName[0]}.` : ''}
                            </p>
                            <p className="text-xs text-gray-500">{emp.employeeNo}</p>
                          </div>
                        </div>
                      </td>
                      <td className="p-4 text-gray-600 hidden md:table-cell">{emp.department?.name || '—'}</td>
                      <td className="p-4 text-gray-600 hidden lg:table-cell">{emp.position?.title || '—'}</td>
                      <td className="p-4">
                        <Badge className={`text-xs border-0 ${getStatusColor(emp.employmentStatus)}`}>
                          {emp.employmentStatus}
                        </Badge>
                      </td>
                      <td className="p-4 text-right font-medium text-gray-800 hidden sm:table-cell">
                        <span>{fmt(emp.basicSalary.toNumber())}</span>
                        <span className="block text-[10px] text-gray-400 font-normal">
                          {emp.rateType === 'HOURLY' ? '/hr' : emp.rateType === 'DAILY' ? '/day' : '/mo'}
                        </span>
                      </td>
                      <td className="p-4 text-gray-600 hidden lg:table-cell">{formatDate(emp.hireDate)}</td>
                      <td className="p-4 text-center">
                        <div className="flex items-center justify-center gap-2" data-tour="employee-actions">
                          <EmployeeViewButton employeeId={emp.id} />
                          <EmployeeDeleteButton employeeId={emp.id} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {total > limit && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-2">
          <p className="text-sm text-gray-500">
            Showing {(page - 1) * limit + 1}–{Math.min(page * limit, total)} of {total}
          </p>
          <div className="flex gap-2">
            {page > 1 && (
              <Link href={`?page=${page - 1}&search=${search}`}>
                <Button variant="outline" size="sm">Previous</Button>
              </Link>
            )}
            {page * limit < total && (
              <Link href={`?page=${page + 1}&search=${search}`}>
                <Button variant="outline" size="sm">Next</Button>
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

