import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import { EmployeeForm } from '@/components/employees/EmployeeForm'
import { resolveEffectiveCompanyId } from '@/lib/effective-company'
import { getSeatStatus } from '@/lib/billing/seat-limit'

export default async function NewEmployeePage() {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const companyId = await resolveEffectiveCompanyId(session.user)
  if (!companyId) redirect('/login')

  // Don't even render the form when the company is at-or-over their
  // paid seat cap — bounce straight to billing. SUPER_ADMIN bypasses
  // (impersonation support). Mirrors the API's POST /api/employees
  // guard so the experience is consistent whether the user lands here
  // via the navbar, a deep link, or browser history.
  if (session.user.role !== 'SUPER_ADMIN') {
    const seat = await getSeatStatus(companyId)
    if (seat.enforceCap && seat.activeCount >= seat.paidSeats) {
      redirect('/settings/billing')
    }
  }

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
      select: { id: true, name: true, scheduleType: true },
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
