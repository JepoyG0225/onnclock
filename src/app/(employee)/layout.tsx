import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { getCompanyLite } from '@/lib/data/company'
import { getEmployeeLiteByUser } from '@/lib/data/employee'
import { PortalHeader } from '@/components/employee/PortalHeader'
import { PortalBottomNav } from '@/components/employee/PortalBottomNav'
import { PortalSidebar } from '@/components/employee/PortalSidebar'
import { FloatingChat } from '@/components/chat/FloatingChat'

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

  const sharedProps = {
    companyName:     company?.name,
    companyLogoUrl:  company?.logoUrl ?? undefined,
    employeeName,
    employeeInitials,
    employeeNo:      employee?.employeeNo ?? undefined,
  }

  return (
    <div className="min-h-screen" style={{ background: '#f0f6f8' }}>
      {/* Desktop sidebar — hidden on mobile */}
      <PortalSidebar {...sharedProps} />

      {/* Mobile top header — hidden on desktop */}
      <PortalHeader {...sharedProps} />

      {/* Page content
          Mobile:  pt-14 (header height) + pb for bottom dock
          Desktop: pl-60 (sidebar width), no top/bottom offset needed */}
      <main className="lg:pl-60 pt-14 lg:pt-0 min-h-screen pb-[calc(88px+env(safe-area-inset-bottom))] lg:pb-0">
        {children}
      </main>

      {/* Mobile bottom navigation dock — hidden on desktop */}
      <PortalBottomNav />

      {/* Floating chat */}
      <FloatingChat portal />
    </div>
  )
}
