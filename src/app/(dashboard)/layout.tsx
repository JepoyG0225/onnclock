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
import { SubscriptionExpiryNotice } from '@/components/layout/SubscriptionExpiryNotice'
import { AdminVirtualTour } from '@/components/onboarding/AdminVirtualTour'
import { PageTour } from '@/components/onboarding/PageTour'
import { prisma } from '@/lib/prisma'
import { cookies, headers } from 'next/headers'
import { verifyImpersonateToken, IMPERSONATE_COOKIE } from '@/lib/impersonate'
import { getSeatStatus } from '@/lib/billing/seat-limit'
import { hasTaskModuleBetaAccess } from '@/lib/feature-gates'
import { getEffectivePermissions } from '@/lib/auth/effective-permissions'
import { ROLE_PERMISSIONS } from '@/lib/auth/permissions'
import { canAccessPath, findFirstAccessiblePath } from '@/lib/auth/page-access'
import { PermissionsProvider } from '@/components/auth/PermissionsProvider'

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

  // Keep layout DB work light for faster route transitions. The two
  // queries below are independent — run them in parallel via Promise.all
  // so the layout only blocks for max(company, sub), not sum(...).
  // Saves roughly one Supabase round-trip on every navigation.
  let company: Awaited<ReturnType<typeof getCompanyLite>> | null = null
  const counts = {
    pendingDtr: 0,
    pendingLeaves: 0,
    pendingOvertime: 0,
    pendingTimeCorrections: 0,
    pendingBudgetRequisitions: 0,
    pendingCashAdvances: 0,
  }
  let sub: { status: string; trialEndsAt: Date | null; currentPeriodEnd: Date | null; pricePerSeat?: unknown } | null = null

  // Wrap each query in a hard 4s timeout — a hung Prisma call (pool
  // exhaustion during a burst, blocked connection from another region)
  // was making the layout sit on a single slow query until the Vercel
  // function timeout (≈10–15s) and 500'd. Now each individual load
  // degrades to its empty-state fallback if it doesn't respond in
  // under 4 seconds; the affected widget renders empty but the
  // dashboard stays responsive.
  function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
    return Promise.race([
      p,
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error(`Timeout (${ms}ms): ${label}`)), ms),
      ),
    ])
  }

  let unbilledSeats = 0
  const dashLoads = await Promise.allSettled([
    companyId ? withTimeout(getCompanyLite(companyId), 4000, 'getCompanyLite') : Promise.resolve(null),
    canManageCompanyData
      ? withTimeout(
          prisma.subscription.findUnique({
            where: { companyId },
            select: { status: true, trialEndsAt: true, currentPeriodEnd: true, pricePerSeat: true },
          }),
          4000,
          'subscription',
        )
      : Promise.resolve(null),
    // Seat audit feeds SubscriptionGate. Returns {unbilled: 0} for
    // TRIAL / no-subscription so the gate stays inactive there; only
    // ACTIVE companies with activeCount > seatCount get redirected.
    canManageCompanyData && companyId
      ? withTimeout(getSeatStatus(companyId), 4000, 'getSeatStatus')
      : Promise.resolve(null),
  ])
  if (dashLoads[0].status === 'fulfilled') company = dashLoads[0].value
  if (dashLoads[1].status === 'fulfilled') sub = dashLoads[1].value
  if (dashLoads[2].status === 'fulfilled' && dashLoads[2].value?.isOver) {
    unbilledSeats = dashLoads[2].value.unbilled
  }
  dashLoads.forEach((r, i) => {
    if (r.status === 'rejected') {
      const which = ['company', 'subscription', 'seatStatus'][i]
      console.error(`[dashboard layout] ${which} load failed for company ${companyId ?? '?'}:`, r.reason)
    }
  })

  let subStatus = 'ACTIVE'
  let trialEndsAt: string | null = null
  let expiryNoticeAt: string | null = null
  let expiryNoticeIsTrial = true
  let hrisProEnabled = true // default on for SUPER_ADMIN / no subscription
  if (sub) {
    const computedStatus =
      sub.status === 'TRIAL' && sub.trialEndsAt && sub.trialEndsAt < new Date()
        ? 'EXPIRED'
        : sub.status
    subStatus = computedStatus
    trialEndsAt = sub.trialEndsAt ? sub.trialEndsAt.toISOString() : null
    const isTrial = sub.status === 'TRIAL'
    const pricePerSeat = Number(sub.pricePerSeat ?? 0)
    hrisProEnabled = isTrial || pricePerSeat >= 100

    // Pick the relevant expiry date for the in-app warning
    if (isTrial && sub.trialEndsAt) {
      expiryNoticeAt = sub.trialEndsAt.toISOString()
      expiryNoticeIsTrial = true
    } else if (!isTrial && sub.currentPeriodEnd && computedStatus === 'ACTIVE') {
      expiryNoticeAt = sub.currentPeriodEnd.toISOString()
      expiryNoticeIsTrial = false
    }
  }
  if (session.user.role === 'SUPER_ADMIN') hrisProEnabled = true

  // Disbursement is unlocked for all Pro (and trial) subscribers.
  const disbursementEnabled = hrisProEnabled

  // ── Role-permission enforcement ────────────────────────────────────
  // Load the effective Permission[] for this user × company (honors the
  // per-company override saved from the Role Permissions matrix). Then,
  // if the user navigated directly to a page their role isn't ticked for,
  // bounce them back to /dashboard. SUPER_ADMIN bypasses inside the
  // loader, so impersonation is unaffected.
  // Same 4s timeout pattern — the permission resolver does up to 2
  // queries (custom-role assignment + companyRolePermission override)
  // and a hung connection here was contributing to the same slow-
  // function pattern users saw on /portal/clock.
  //
  // CRITICAL: on timeout/failure we fall back to the hardcoded
  // ROLE_PERMISSIONS defaults for this role — NOT an empty array. An
  // empty fallback would gate out every nav item except the few paths
  // not in PATH_REQUIRED_PERMISSIONS, which is exactly the
  // "sidebar shows only one item" bug users reported. The hardcoded
  // defaults are the same set a fresh company starts with, so the
  // user sees their normal role-appropriate nav while the DB sorts
  // itself out.
  const safeFallback = (ROLE_PERMISSIONS[effectiveRole as keyof typeof ROLE_PERMISSIONS] ?? []) as Awaited<ReturnType<typeof getEffectivePermissions>>
  let permissions: Awaited<ReturnType<typeof getEffectivePermissions>> = safeFallback
  try {
    permissions = await withTimeout(
      getEffectivePermissions(effectiveRole, companyId ?? null, session.user.id ?? null),
      4000,
      'getEffectivePermissions',
    )
  } catch (err) {
    console.error(`[dashboard layout] getEffectivePermissions failed for company ${companyId ?? '?'}, falling back to ${effectiveRole} defaults:`, err)
  }
  // ── Task Management beta gate ───────────────────────────────────
  // Stripping the tasks:* permissions here (rather than adding a special
  // case to the sidebar and the route guard separately) means both the nav
  // filtering and the direct-URL redirect below pick the gate up for free.
  // SUPER_ADMIN is not exempt: the module's tables may not exist yet, so an
  // admin landing on it would just hit a 500.
  if (!hasTaskModuleBetaAccess(session.user.email)) {
    permissions = permissions.filter(p => p !== 'tasks:read' && p !== 'tasks:manage')
  }

  const pathname = (await headers()).get('x-pathname') ?? ''
  if (pathname && !canAccessPath(pathname, permissions)) {
    // /dashboard is itself now gated (so narrow custom roles like
    // "Operations Lead" can hide it). If the redirect target is the
    // dashboard but the user can't open it either, we'd loop. Pick the
    // first nav path their permission set actually allows instead.
    redirect(findFirstAccessiblePath(permissions))
  }

  return (
    <SidebarProvider>
      <div className="min-h-screen bg-gray-50">
        {impersonating && (
          <ImpersonationBanner companyName={impersonating.companyName} />
        )}
        {session.user.role !== 'SUPER_ADMIN' && (
          <SubscriptionExpiryNotice expiresAt={expiryNoticeAt} isTrial={expiryNoticeIsTrial} />
        )}
        <AppSidebar
          initialLogoUrl={company?.logoUrl ?? null}
          initialUserRole={effectiveRole}
          initialCounts={counts}
          initialTrialEndsAt={trialEndsAt}
          isLocal={process.env.NODE_ENV === 'development'}
          hrisProEnabled={hrisProEnabled}
          disbursementEnabled={disbursementEnabled}
          permissions={permissions}
        />
        <AppHeader
          user={{ email: session.user.email, name: session.user.name }}
          companyName={company?.name}
        />
        <MainContent>
          <SubscriptionGate
            status={subStatus}
            trialEndsAt={trialEndsAt}
            bypassGate={session.user.role === 'SUPER_ADMIN'}
            unbilledSeats={unbilledSeats}
          >
            <PermissionsProvider permissions={permissions}>
              {children}
            </PermissionsProvider>
          </SubscriptionGate>
        </MainContent>
        <AdminVirtualTour
          userId={session.user.id}
          role={effectiveRole}
          actorRole={session.user.role}
          permissions={permissions}
        />
        {/*
          Per-page tours. This component documents itself as "mounted once in
          the dashboard layout" but never actually was, so page tours had
          never run — the tour definitions in lib/onboarding/page-tours were
          dead code. Mounted here now, with the same role gating the nav tour
          uses (its own `allowed` check also excludes SUPER_ADMIN).
        */}
        <PageTour
          userId={session.user.id}
          role={effectiveRole}
          actorRole={session.user.role}
          enabled
        />
      </div>
    </SidebarProvider>
  )
}
