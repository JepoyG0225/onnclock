import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { getCompanyLite } from '@/lib/data/company'
import { getEmployeeLiteByUser } from '@/lib/data/employee'
import { PortalHeader } from '@/components/employee/PortalHeader'
import { PortalBottomNav } from '@/components/employee/PortalBottomNav'

export default async function EmployeePortalLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()
  if (!session?.user) redirect('/portal/login')

  const [company, employee] = session.user.companyId
    ? await Promise.all([
        getCompanyLite(session.user.companyId),
        getEmployeeLiteByUser(session.user.id, session.user.companyId),
      ])
    : [undefined, null]

  const employeeName = employee
    ? `${employee.firstName} ${employee.lastName}`
    : (session.user.name ?? 'Employee')

  const employeeInitials = employee
    ? `${employee.firstName[0]}${employee.lastName[0]}`.toUpperCase()
    : (session.user.name?.[0]?.toUpperCase() ?? 'E')

  return (
    <div className="min-h-screen" style={{ background: '#f0f6f8' }}>
      {/* Sticky top header */}
      <PortalHeader
        companyName={company?.name}
        companyLogoUrl={company?.logoUrl ?? undefined}
        employeeName={employeeName}
        employeeInitials={employeeInitials}
        employeeNo={employee?.employeeNo ?? undefined}
      />

      {/* Page content — padded for header + bottom dock */}
      <main
        className="pt-14 min-h-screen"
        style={{ paddingBottom: 'calc(140px + env(safe-area-inset-bottom))' }}
      >
        {children}
      </main>

      {/* Bottom navigation dock */}
      <PortalBottomNav />
    </div>
  )
}
