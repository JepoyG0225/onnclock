import { cache } from 'react'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'

const getSession = cache(auth)
import { getCompanyLite } from '@/lib/data/company'
import { AppSidebar } from '@/components/layout/AppSidebar'
import { AppHeader } from '@/components/layout/AppHeader'
import { SidebarProvider } from '@/components/layout/SidebarContext'
import { MainContent } from '@/components/layout/MainContent'
import { SubscriptionGate } from '@/components/layout/SubscriptionGate'
import { ImpersonationBanner } from '@/components/layout/ImpersonationBanner'
import { FloatingChat } from '@/components/chat/FloatingChat'
import { AdminVirtualTour } from '@/components/onboarding/AdminVirtualTour'
import { prisma } from '@/lib/prisma'
import { cookies } from 'next/headers'
import { verifyImpersonateToken, IMPERSONATE_COOKIE } from '@/lib/impersonate'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await getSession()

  if (!session?.user) {
    redirect('/login')
  }

  // Check for active impersonation session
  let impersonating: { companyId: string; companyName: string; role: string } | null = null
  if (session.user.role === 'SUPER_ADMIN') {
    const jar = await cookies()
    const impToken = jar.get(IMPERSONATE_COOKIE)?.value
    if (impToken) {
      const imp = await verifyImpersonateToken(impToken)
      if (imp && imp.impersonatedBy === session.user.id) {
        impersonating = { companyId: imp.companyId, companyName: imp.companyName, role: imp.role }
      }
    }
  }

  const companyId = impersonating?.companyId ?? session.user.companyId
  const canManageCompanyData = !!companyId && (session.user.role !== 'SUPER_ADMIN' || !!impersonating)
  const effectiveRole = impersonating?.role ?? session.user.role

  // Keep layout DB work light for faster route transitions.
  let company: Awaited<ReturnType<typeof getCompanyLite>> | null = null
  const counts = { pendingDtr: 0, pendingLeaves: 0 }
  let sub: { status: string; trialEndsAt: Date | null } | null = null

  try {
    if (companyId) {
      company = await getCompanyLite(companyId)
    }
    if (canManageCompanyData) {
      sub = await prisma.subscription.findUnique({
        where: { companyId },
        select: { status: true, trialEndsAt: true },
      })
    }
  } catch (error) {
    console.error('DashboardLayout data load failed', error)
  }

  let subStatus = 'ACTIVE'
  let trialEndsAt: string | null = null
  if (sub) {
    const computedStatus =
      sub.status === 'TRIAL' && sub.trialEndsAt && sub.trialEndsAt < new Date()
        ? 'EXPIRED'
        : sub.status
    subStatus = computedStatus
    trialEndsAt = sub.trialEndsAt ? sub.trialEndsAt.toISOString() : null
  }

  return (
    <SidebarProvider>
      <div className="min-h-screen bg-gray-50">
        {impersonating && (
          <ImpersonationBanner companyName={impersonating.companyName} />
        )}
        <AppSidebar
          initialLogoUrl={company?.logoUrl ?? null}
          initialUserRole={effectiveRole}
          initialCounts={counts}
          initialTrialEndsAt={trialEndsAt}
          isLocal={process.env.NODE_ENV === 'development'}
        />
        <AppHeader
          user={{ email: session.user.email, name: session.user.name }}
          companyName={company?.name}
        />
        <MainContent>
          <SubscriptionGate status={subStatus} trialEndsAt={trialEndsAt} bypassGate={session.user.role === 'SUPER_ADMIN'}>
            {children}
          </SubscriptionGate>
        </MainContent>
        <FloatingChat />
        <AdminVirtualTour
          userId={session.user.id}
          role={effectiveRole}
          actorRole={session.user.role}
        />
      </div>
    </SidebarProvider>
  )
}
