import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { getCompanyLite } from '@/lib/data/company'
import { getEmployeeLiteByUser } from '@/lib/data/employee'
import { getCompanySubscription, hasHrisProFeature } from '@/lib/feature-gates'
import { getPausedEmployees } from '@/lib/billing/seat-limit'
import { PortalHeader } from '@/components/employee/PortalHeader'
import { PortalBottomNav } from '@/components/employee/PortalBottomNav'
import { PortalSidebar } from '@/components/employee/PortalSidebar'
import { PortalAnnouncementPopup } from '@/components/employee/PortalAnnouncementPopup'
import { Lock } from 'lucide-react'

export default async function EmployeePortalLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()
  if (!session?.user) redirect('/portal/login')

  const [company, employee, sub, pausedEmployees] = session.user.companyId
    ? await Promise.all([
        getCompanyLite(session.user.companyId),
        getEmployeeLiteByUser(session.user.id, session.user.companyId),
        getCompanySubscription(session.user.companyId),
        getPausedEmployees(session.user.companyId),
      ])
    : [undefined, null, { pricePerSeat: 0, isTrial: false }, { ids: [], details: [] }]

  // Seat-cap lockout: if this employee is one of the newest hires that
  // pushed the company over its paid seat count, block portal access
  // entirely with a "contact your admin" notice. Resolves automatically
  // once the company adds seats (or deactivates other employees so the
  // count drops back within the limit).
  const isPausedForBilling = !!employee?.id && pausedEmployees.ids.includes(employee.id)
  if (isPausedForBilling) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ background: '#f0f6f8' }}>
        <div className="w-full max-w-md rounded-2xl bg-white shadow-xl overflow-hidden border border-slate-200">
          <div className="px-6 pt-8 pb-6 text-center">
            <div className="w-14 h-14 rounded-full bg-amber-100 flex items-center justify-center mx-auto mb-4">
              <Lock className="w-7 h-7 text-amber-700" />
            </div>
            <h1 className="text-lg font-black text-slate-900">Access paused</h1>
            <p className="text-sm text-slate-600 mt-3 leading-relaxed">
              Your portal access has been temporarily paused because
              <strong> {company?.name ?? 'your company'}</strong> is over its paid
              subscription seats. Please <strong>contact your admin</strong> to
              purchase additional seats so your access can be restored.
            </p>
          </div>
          <div className="px-6 py-3 bg-slate-50 border-t border-slate-200">
            <p className="text-[11px] text-slate-500 text-center">
              Signed in as {session.user.email}
            </p>
          </div>
        </div>
      </div>
    )
  }

  // Pro/Trial-only features — also available during trial so companies can evaluate them.
  const isProOrTrial = hasHrisProFeature(sub.pricePerSeat) || sub.isTrial
  const isProPlan = hasHrisProFeature(sub.pricePerSeat)
  const showDisciplinary = isProOrTrial
  const showBudgetReq = isProPlan

  const employeeName = employee
    ? `${employee.firstName} ${employee.lastName}`
    : (session.user.name ?? 'Employee')

  const employeeInitials = employee
    ? `${employee.firstName[0]}${employee.lastName[0]}`.toUpperCase()
    : (session.user.name?.[0]?.toUpperCase() ?? 'E')

  const sharedProps = {
    companyName:      company?.name,
    companyLogoUrl:   company?.logoUrl ?? undefined,
    employeeName,
    employeeInitials,
    employeeNo:       employee?.employeeNo ?? undefined,
    showDisciplinary,
    showBudgetReq,
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
      <PortalBottomNav showDisciplinary={showDisciplinary} showBudgetReq={showBudgetReq} />
      {session.user.companyId && (
        <PortalAnnouncementPopup userId={session.user.id} companyId={session.user.companyId} />
      )}

    </div>
  )
}
