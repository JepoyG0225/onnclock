/**
 * Performance — the employee's reviews and disciplinary record in one place.
 *
 * These were /portal/reviews and /portal/disciplinary. Both answer "how am I
 * doing", so they read better as two tabs than two nav entries, and it mirrors
 * the admin side where Reviews and Disciplinary already share a merged page.
 *
 * Reviews is available to everyone; Disciplinary is HRIS-Pro (or trial), the
 * same rule the standalone route was behind. Resolved here on the server so a
 * non-entitled company is never offered the tab.
 */
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { getCompanySubscription, hasHrisProFeature } from '@/lib/feature-gates'
import { PerformanceTabs } from '@/components/employee/PerformanceTabs'

export const dynamic = 'force-dynamic'

export default async function PortalPerformancePage() {
  const session = await auth()
  if (!session?.user) redirect('/portal/login')

  const companyId = session.user.companyId
  const sub = companyId
    ? await getCompanySubscription(companyId).catch(() => ({ pricePerSeat: 0, isTrial: false }))
    : { pricePerSeat: 0, isTrial: false }

  const showDisciplinary = hasHrisProFeature(sub.pricePerSeat) || sub.isTrial

  return <PerformanceTabs showDisciplinary={showDisciplinary} />
}
