import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import { resolveEffectiveCompanyId } from '@/lib/effective-company'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { EmployeeDeleteButton } from '@/components/employees/EmployeeDeleteButton'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Plus, Users, Search } from 'lucide-react'
import { formatDate, peso, getStatusColor } from '@/lib/utils'
import { EmploymentStatus } from '@prisma/client'

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

  const where = {
    companyId,
    ...(departmentId && { departmentId }),
    ...(status && { employmentStatus: status as EmploymentStatus }),
    ...(search && {
      OR: [
        { firstName: { contains: search } },
        { lastName: { contains: search } },
        { employeeNo: { contains: search } },
      ],
    }),
  }

  const [employees, total, departments] = await Promise.all([
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
  ])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Employees</h1>
          <p className="text-gray-500 mt-1">{total} total employees</p>
        </div>
        <Link href="/employees/new">
          <Button>
            <Plus className="mr-2 w-4 h-4" />
            Add Employee
          </Button>
        </Link>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <form className="flex flex-wrap gap-3">
            <div className="flex-1 min-w-48 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                name="search"
                placeholder="Search by name or employee no..."
                defaultValue={search}
                className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#2E4156]"
              />
            </div>
            <select
              name="department"
              defaultValue={departmentId}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#2E4156]"
            >
              <option value="">All Departments</option>
              {departments.map(d => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
            <select
              name="status"
              defaultValue={status}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#2E4156]"
            >
              <option value="">All Status</option>
              <option value="PROBATIONARY">Probationary</option>
              <option value="REGULAR">Regular</option>
              <option value="CONTRACTUAL">Contractual</option>
              <option value="RESIGNED">Resigned</option>
              <option value="TERMINATED">Terminated</option>
            </select>
            <Button type="submit" variant="outline" size="sm">Filter</Button>
          </form>
        </CardContent>
      </Card>

      {/* Employee Table */}
      <Card>
        <CardContent className="p-0">
          {employees.length === 0 ? (
            <div className="text-center py-16">
              <Users className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500">No employees found</p>
              <Link href="/employees/new" className="mt-3 inline-block">
                <Button size="sm">Add your first employee</Button>
              </Link>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50">
                    <th className="text-left p-4 font-semibold text-gray-600">Employee</th>
                    <th className="text-left p-4 font-semibold text-gray-600">Department</th>
                    <th className="text-left p-4 font-semibold text-gray-600">Position</th>
                    <th className="text-left p-4 font-semibold text-gray-600">Status</th>
                    <th className="text-right p-4 font-semibold text-gray-600">Basic Salary</th>
                    <th className="text-left p-4 font-semibold text-gray-600">Hire Date</th>
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
                            <div className="w-9 h-9 rounded-full bg-[#C0C8CA] flex items-center justify-center text-xs font-bold text-[#1A2D42] flex-shrink-0">
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
                      <td className="p-4 text-gray-600">{emp.department?.name || '—'}</td>
                      <td className="p-4 text-gray-600">{emp.position?.title || '—'}</td>
                      <td className="p-4">
                        <Badge className={`text-xs border-0 ${getStatusColor(emp.employmentStatus)}`}>
                          {emp.employmentStatus}
                        </Badge>
                      </td>
                      <td className="p-4 text-right font-medium text-gray-800">
                        {peso(emp.basicSalary.toNumber())}
                      </td>
                      <td className="p-4 text-gray-600">{formatDate(emp.hireDate)}</td>
                      <td className="p-4 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <Link href={`/employees/${emp.id}`}>
                            <Button variant="ghost" size="sm" className="text-[#2E4156] hover:text-[#1A2D42]">
                              View
                            </Button>
                          </Link>
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
        <div className="flex items-center justify-between">
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

