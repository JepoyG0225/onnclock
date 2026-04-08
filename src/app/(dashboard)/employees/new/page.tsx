import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import { EmployeeForm } from '@/components/employees/EmployeeForm'

export default async function NewEmployeePage() {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const companyId = session.user.companyId!

  const [departments, positions, workSchedules] = await Promise.all([
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Add New Employee</h1>
        <p className="text-gray-500 mt-1">Fill in the 201 file information</p>
      </div>
      <EmployeeForm
        departments={departments}
        positions={positions}
        workSchedules={workSchedules}
      />
    </div>
  )
}
